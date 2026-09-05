import type { CanonicalDocument, ClockSignal, CommentRow, SignalRole, SignalId, ValueSignal } from "@timing-chart-v2/schema";
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
