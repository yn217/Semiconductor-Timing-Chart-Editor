import type { Annotation, Bookmark, CanonicalDocument, ClockSignal, CommentRow, SignalRole, SignalId, Transaction, TransactionGroup, ValueSignal } from "@timing-chart-v2/schema";
import { groupId, signalId, valueSignal } from "./minimal-cycle-view-fixture-helpers.js";

export const clock: ClockSignal = {
  id: signalId("sig_cycle_clock"), name: "CLOCK", type: "clock", role: "input",
  source: { instancePath: ["dut"], signalName: "clock" }, display: { name: "CLOCK" },
  generator: { start: 0, period: 2, duty: 0.5, phase: 0, initial: 0, polarity: "positive" },
  edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
};

const signals: readonly (ClockSignal | ValueSignal)[] = [
  clock,
  valueSignal("sig_cycle_reset_n", "RESET_N", "input", [{ start: 0, value: 0 }, { start: 2, value: 1 }]),
  valueSignal("sig_cycle_request", "REQUEST", "input", [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]),
  valueSignal("sig_cycle_ready", "READY", "output", [{ start: 0, value: 0 }, { start: 5, value: 1 }, { start: 8, value: 0 }]),
  valueSignal("sig_cycle_valid", "VALID", "output", [{ start: 0, value: 0 }, { start: 6, value: 1 }, { start: 9, value: 0 }]),
  valueSignal("sig_cycle_data", "DATA[7:0]", "input", [{ start: 0, value: "00" }, { start: 3, value: "A5" }, { start: 7, value: "5A" }], { type: "bus", width: 8, displayFormat: "hex" }),
  valueSignal("sig_cycle_result", "RESULT[7:0]", "output", [{ start: 0, value: "00" }, { start: 6, value: "A5" }, { start: 9, value: "5A" }], { type: "bus", width: 8, displayFormat: "hex" }),
  valueSignal("sig_cycle_state", "STATE", "internal", [{ start: 0, value: "IDLE" }, { start: 3, value: "WAIT" }, { start: 6, value: "DONE" }], { type: "state" }),
];

export const cycleDocument: CanonicalDocument = {
  formatVersion: 2,
  document: {
    id: "minimal-cycle-view", title: "Semiconductor Timing Chart",
    header: { subtitle: "Canonical document preview", description: "", notes: "", preconditions: [], constraints: [], exceptions: [] },
    footer: { figureNumber: "", revision: "V2", text: "" },
  },
  timeline: { start: 0, end: 24, cycleCount: 24, timeBase: "cycle", referenceClock: clock.id, edge: "rising", labelAnchors: [] },
  signalGroups: [
    { id: groupId("grp_cycle_control"), name: "Control", rows: signals.slice(0, 5).map((signal) => signal.id), spacingAfter: 8 },
    { id: groupId("grp_cycle_payload"), name: "Payload", rows: signals.slice(5).map((signal) => signal.id), spacingBefore: 4 },
    { id: groupId("grp_cycle_scratch"), name: "Scratch", rows: [] },
  ],
  signals,
  bookmarks: [], timeGroups: [], annotations: [], annotationGroups: [], transactions: [], constraints: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { roleColumnWidth: 61, signalNameWidth: 148, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" },
  checkSettings: {},
};

/** Initial browser document for Transaction-mode inspection. New documents
 * still use `cycleDocument`; this sample only gives the default workspace
 * useful content after switching to Transaction mode or refreshing the app. */
const transactionDemoGroups: readonly TransactionGroup[] = [
  { id: "demo_tgrp_memory" as TransactionGroup["id"], name: "Memory", color: "#2f6fd1", order: 0 },
  { id: "demo_tgrp_cpu" as TransactionGroup["id"], name: "CPU", color: "#e07b1f", order: 1 },
  { id: "demo_tgrp_peripheral" as TransactionGroup["id"], name: "Peripheral", color: "#c62f2f", order: 2 },
];
const transactionDemoTransactions = [
  { id: "demo_txn_read", name: "Read_0", start: 10, end: 60, laneId: "lane_0", groupId: "demo_tgrp_memory", color: "#3b82f6", description: "Memory read transaction", phases: [{ name: "Address", start: 10, end: 20 }, { name: "Read Data", start: 20, end: 50 }, { name: "Response", start: 50, end: 60 }], linkedSignals: ["sig_cycle_data", "sig_cycle_result"] },
  { id: "demo_txn_write", name: "Write_0", start: 70, end: 130, laneId: "lane_0", groupId: "demo_tgrp_memory", color: "#8b5cf6", description: "Memory write transaction", phases: [{ name: "Address", start: 70, end: 80 }, { name: "Write Data", start: 80, end: 120 }, { name: "Response", start: 120, end: 130 }], linkedSignals: ["sig_cycle_data", "sig_cycle_result"] },
  { id: "demo_txn_fetch", name: "Fetch_0", start: 15, end: 55, laneId: "lane_1", groupId: "demo_tgrp_cpu", color: "#f59e0b", description: "Instruction fetch", phases: [{ name: "Fetch", start: 15, end: 25 }, { name: "Decode", start: 25, end: 45 }, { name: "Wait", start: 45, end: 55 }], linkedSignals: ["sig_cycle_request"] },
  { id: "demo_txn_execute", name: "Execute_0", start: 65, end: 120, laneId: "lane_1", groupId: "demo_tgrp_cpu", color: "#10b981", description: "Instruction execute", phases: [{ name: "Execute", start: 65, end: 85 }, { name: "Memory", start: 85, end: 105 }, { name: "Write Back", start: 105, end: 120 }], linkedSignals: ["sig_cycle_ready", "sig_cycle_valid"] },
  { id: "demo_txn_spi", name: "SPI_0", start: 30, end: 90, laneId: "lane_2", groupId: "demo_tgrp_peripheral", color: "#ef4444", description: "SPI transfer", phases: [{ name: "Command", start: 30, end: 50 }, { name: "Data", start: 50, end: 70 }, { name: "Stop", start: 70, end: 90 }], linkedSignals: ["sig_cycle_ready"] },
  { id: "demo_txn_other", name: "Transaction2", start: 100, end: 140, laneId: "lane_0", color: "#8895a7", description: "Ungrouped transaction" },
] as unknown as readonly Transaction[];
const showcaseAnnotations: readonly Annotation[] = [
  { id: "demo_ann_request" as Annotation["id"], type: "text", label: "Request accepted", visible: true, color: "#155ca0", anchor: { signalId: signalId("sig_cycle_request"), cycle: 12, point: "cycle-start" } },
  { id: "demo_ann_data" as Annotation["id"], type: "range", label: "Data transfer window", visible: true, color: "#b45309", start: { signalId: signalId("sig_cycle_data"), cycle: 24, point: "cycle-start" }, end: { signalId: signalId("sig_cycle_data"), cycle: 40, point: "cycle-start" } },
  { id: "demo_ann_response" as Annotation["id"], type: "arrow", label: "Response", visible: true, color: "#15803d", start: { signalId: signalId("sig_cycle_valid"), cycle: 44, point: "cycle-start" }, end: { signalId: signalId("sig_cycle_result"), cycle: 52, point: "cycle-start" }, arrowhead: "end" },
];
export const transactionDemoDocument: CanonicalDocument = {
  ...cycleDocument,
  document: { ...cycleDocument.document, id: "transaction-demo", title: "Sample -- Transaction Mode" },
  timeline: { ...cycleDocument.timeline, end: 160, cycleCount: 160 },
  transactionTimeScale: { clockCyclesPerTransactionCycle: 10, majorInterval: 5, minorInterval: 1 },
  transactionGroups: transactionDemoGroups,
  bookmarks: [
    { id: "demo_bookmark_reset" as Bookmark["id"], name: "Reset Release", start: 4, comment: "Initialization complete" },
    { id: "demo_bookmark_read_start" as Bookmark["id"], name: "Read start", start: 10, comment: "Memory transaction begins" },
    { id: "demo_bookmark_request" as Bookmark["id"], name: "Request Start", start: 12, comment: "Request phase begins" },
    { id: "demo_bookmark_data" as Bookmark["id"], name: "Data Valid", start: 28, comment: "Payload becomes valid" },
    { id: "demo_bookmark_response" as Bookmark["id"], name: "Response Complete", start: 52, comment: "Response accepted" },
  ],
  annotations: showcaseAnnotations,
  transactions: transactionDemoTransactions,
};

export const v1ReferenceComment: CommentRow = {
  id: signalId("sig_v1_reference_comment"), type: "commentRow", name: "Address phase", role: "internal",
  source: { instancePath: ["dut"], signalName: "address_phase" }, display: { name: "Address phase" },
  title: "Address phase", body: "Address phase (req_valid = 1.0 period)",
};

export const v8ReferenceProcessingComment: CommentRow = {
  id: signalId("sig_v8_reference_processing_comment"), type: "commentRow", name: "Processing note", role: "internal",
  source: { instancePath: ["dut"], signalName: "processing_note" }, display: { name: "Processing note" },
  title: "Processing note", body: "Processing: New request is latched",
};

export const v8ReferenceLatencyComment: CommentRow = {
  id: signalId("sig_v8_reference_latency_comment"), type: "commentRow", name: "Read latency", role: "internal",
  source: { instancePath: ["dut"], signalName: "read_latency" }, display: { name: "Read latency" },
  title: "Read latency", body: "Read data available 5 cycles after request accepted",
};

export const v8ReferenceClock: ClockSignal = { ...clock, name: "clk", source: { instancePath: [], signalName: "clk" }, display: { name: "clk" }, generator: { ...clock.generator, period: 1 } };
export const v8ReferenceSignals: readonly (ClockSignal | ValueSignal)[] = [
  valueSignal("sig_cycle_reset_n", "req_valid", "input", [{ start: 0, value: 0 }, { start: 3, value: 1 }]),
  valueSignal("sig_cycle_request", "req_addr[7:0]", "input", [{ start: 0, value: "00" }, { start: 3, value: "12" }, { start: 7, value: "34" }], { type: "bus", width: 8, displayFormat: "hex" }),
  v8ReferenceClock,
  valueSignal("sig_cycle_ready", "busy", "internal", [{ start: 0, value: 0 }, { start: 3, value: 1 }, { start: 7, value: 0 }]),
  valueSignal("sig_cycle_valid", "state[1:0]", "internal", [{ start: 0, value: "IDLE" }, { start: 2, value: "REQ" }, { start: 6, value: "WAIT" }, { start: 8, value: "RESP" }], { type: "bus", width: 2 }),
  valueSignal("sig_cycle_data", "ready", "output", [{ start: 0, value: 0 }, { start: 8, value: 1 }]),
  valueSignal("sig_cycle_result", "rdata[15:0]", "output", [{ start: 0, value: "XXXX" }, { start: 7, value: "0000" }], { type: "bus", width: 16, displayFormat: "hex" }),
];

export const v1ReferenceDocument: CanonicalDocument = {
  ...cycleDocument,
  timeline: { ...cycleDocument.timeline, end: 10, cycleCount: 10 },
  document: { ...cycleDocument.document, title: "AXI-lite Read Timing.tmr — Timing Editor Pro", header: { ...cycleDocument.document.header, subtitle: "Protocol timing reference" } },
  signals: [...v8ReferenceSignals, v1ReferenceComment, v8ReferenceProcessingComment, v8ReferenceLatencyComment],
  signalGroups: [
    { id: groupId("grp_cycle_control"), name: "Input", rows: ["sig_cycle_reset_n", "sig_cycle_request", v1ReferenceComment.id, "sig_cycle_clock"] as SignalId[], spacingAfter: 5 },
    { id: groupId("grp_cycle_payload"), name: "Internal Control", rows: ["sig_cycle_ready", "sig_cycle_valid", v8ReferenceProcessingComment.id] as SignalId[], spacingAfter: 5 },
    { id: groupId("grp_cycle_scratch"), name: "Output", rows: ["sig_cycle_data", "sig_cycle_result", v8ReferenceLatencyComment.id] as SignalId[] },
  ],
  // The approved V8 Home Golden is the neutral Cycle state: overlays and the
  // editable legend are available in production, but not visible in this
  // reference fixture unless the Golden explicitly shows them.
  annotations: [],
  legend: { show: false, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } },
  layout: { ...cycleDocument.layout, rowHeight: 30, signalSpacing: 1 },
};
