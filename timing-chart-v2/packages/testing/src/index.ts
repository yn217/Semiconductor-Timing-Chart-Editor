import type { Annotation, AnnotationId, CanonicalDocument, ClockSignal, GroupId, Signal, SignalId, Transaction, TransactionId, ValueSignal } from "@timing-chart-v2/schema";

export interface PerformanceCounterExpectation { readonly counter: "waveDromRenders" | "localGeometryBuilds" | "rowPositionUpdates" | "overlayUpdates"; readonly delta: number }
export type PerformanceProfile = "standard" | "clock-heavy" | "bus-heavy" | "annotation-heavy" | "transaction-heavy" | "mixed";
export interface PerformanceFixtureSpec { readonly signalCount: 50 | 100 | 500 | 1000; readonly cycleCount: 100 | 500 | 1000; readonly profile?: PerformanceProfile }

const signalId = (index: number) => `sig_perf_${index}` as SignalId;

function clock(index: number): ClockSignal {
  return { id: signalId(index), name: `CLK_${index}`, type: "clock", role: "input", source: { instancePath: ["perf"], signalName: `clk_${index}` }, display: { name: `CLK_${index}` }, generator: { start: 0, period: 2, duty: 0.5, phase: index % 2 ? 0.5 : 0, initial: 0, polarity: "positive" }, edgeCounter: { show: false, mode: "rising", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } } };
}

function valueSignal(index: number, cycleCount: number, bus: boolean, hidden = false): ValueSignal {
  return { id: signalId(index), name: `${bus ? "BUS" : "SIG"}_${index}`, type: bus ? "bus" : "binary", role: index % 3 === 0 ? "input" : index % 3 === 1 ? "output" : "internal", source: { instancePath: ["perf"], signalName: `signal_${index}` }, display: { name: `${bus ? "BUS" : "SIG"}_${index}`, ...(hidden ? { visible: false } : {}) }, ...(bus ? { width: 32, displayFormat: "hex" as const } : {}), values: [{ start: 0, value: bus ? "00000000" : 0 }, { start: Math.min(cycleCount - 1, Math.max(1, Math.floor(cycleCount / 2) + index % 7)), value: bus ? index.toString(16).padStart(8, "0") : 1 }] };
}

export function generatePerformanceDocument(spec: PerformanceFixtureSpec): CanonicalDocument {
  const profile = spec.profile ?? "standard";
  const signals: Signal[] = Array.from({ length: spec.signalCount }, (_, index) => index === 0 || (profile === "clock-heavy" && index % 3 === 0) ? clock(index) : valueSignal(index, spec.cycleCount, profile === "bus-heavy" || index % 5 === 0, profile === "mixed" && index % 17 === 0));
  const signalGroups = Array.from({ length: Math.ceil(signals.length / 25) }, (_, index) => ({ id: `grp_perf_${index}` as GroupId, name: `Group ${index}`, rows: signals.slice(index * 25, index * 25 + 25).map((signal) => signal.id), spacingAfter: index % 2 ? 4 : 0 }));
  const annotationCount = profile === "annotation-heavy" ? spec.signalCount * 2 : Math.min(12, Math.floor(spec.signalCount / 10));
  const annotations: Annotation[] = Array.from({ length: annotationCount }, (_, index) => ({ id: `ann_perf_${index}` as AnnotationId, type: "measurement", label: `M${index}`, visible: true, start: { signalId: signalId(index % spec.signalCount), cycle: index % Math.max(1, spec.cycleCount - 2), point: "cycle-start" }, end: { signalId: signalId((index + 1) % spec.signalCount), cycle: Math.min(spec.cycleCount - 1, index % Math.max(1, spec.cycleCount - 2) + 2), point: "cycle-start" } }));
  const transactionCount = profile === "transaction-heavy" ? spec.signalCount : Math.min(16, Math.floor(spec.signalCount / 8));
  const transactions: Transaction[] = Array.from({ length: transactionCount }, (_, index) => { const start = index * 3 % Math.max(1, spec.cycleCount - 4); return { id: `txn_perf_${index}` as TransactionId, name: `Transaction ${index}`, start, end: Math.min(spec.cycleCount, start + 4), laneId: `lane_${index % 8}`, linkedSignals: [signalId(index % spec.signalCount)] }; });
  return { formatVersion: 2, document: { id: `perf_${spec.signalCount}x${spec.cycleCount}_${profile}`, title: `Performance ${spec.signalCount} × ${spec.cycleCount}`, header: { subtitle: profile, description: "Generated deterministic performance fixture", notes: "", preconditions: [], constraints: [], exceptions: [] }, footer: { figureNumber: "", revision: "P13", text: "" } }, timeline: { start: 0, end: spec.cycleCount, cycleCount: spec.cycleCount, timeBase: "cycle", referenceClock: signalId(0), edge: "rising", labelAnchors: [] }, signalGroups, signals, bookmarks: [], timeGroups: [], annotations, transactions, constraints: [], legend: { show: true, orientation: "horizontal", usedRolesOnly: true, position: { x: 0, y: 0 } }, layout: { roleColumnWidth: 62, signalNameWidth: 178, signalNameAlign: "left", rowHeight: 30, signalSpacing: 4, overflow: "ellipsis" }, checkSettings: {} };
}

export interface BrowserPerformanceSample { readonly durationMs: number; readonly rafMs: number; readonly longTasks: number; readonly domNodes: number; readonly heapBytes?: number }
export interface PerformanceSummary { readonly trials: number; readonly medianMs: number; readonly p95Ms: number; readonly medianRafMs: number; readonly p95RafMs: number; readonly maxLongTasks: number; readonly maxDomNodes: number }
const percentile = (values: readonly number[], position: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(position * values.length) - 1))] ?? 0;
export function summarizePerformance(samples: readonly BrowserPerformanceSample[]): PerformanceSummary {
  if (samples.length === 0) throw new Error("Performance summary requires at least one sample.");
  return { trials: samples.length, medianMs: percentile(samples.map((sample) => sample.durationMs), 0.5), p95Ms: percentile(samples.map((sample) => sample.durationMs), 0.95), medianRafMs: percentile(samples.map((sample) => sample.rafMs), 0.5), p95RafMs: percentile(samples.map((sample) => sample.rafMs), 0.95), maxLongTasks: Math.max(...samples.map((sample) => sample.longTasks)), maxDomNodes: Math.max(...samples.map((sample) => sample.domNodes)) };
}
