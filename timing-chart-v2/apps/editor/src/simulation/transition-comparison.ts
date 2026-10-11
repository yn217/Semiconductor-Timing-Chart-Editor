import {
  compareExactSourceCycle,
  vcdTimestampToSourceCycles,
  type ExactSourceCycle,
  type VcdTimescale,
} from "@timing-chart-v2/projection";
import type { PhysicalTimebase } from "@timing-chart-v2/schema";
import { parseBusValue, type BusValueFormat } from "@timing-chart-v2/schema";
import type { VcdValueChange } from "./vcd-text-parser.js";
import { VCD_RESOURCE_BUDGET } from "./vcd-resource-budget.js";

/** Stable canonical identity paired with the exact VCD variable code. */
export type MatchedSignalIdentity = Readonly<{
  signalId: string;
  vcdCode: string;
}>;

export type AuthoredTransition = Readonly<{
  cycle: number;
  value: string | number;
}>;

export type TransitionDifferenceKind =
  | "value-mismatch"
  | "timing-mismatch"
  | "missing-event"
  | "extra-event"
  | "unsupported-value";

export type TransitionDifference = Readonly<{
  kind: TransitionDifferenceKind;
  signalId: string;
  authoredCycle?: ExactSourceCycle;
  vcdCycle?: ExactSourceCycle;
  authoredValue?: string;
  vcdValue?: string;
  detail?: string;
}>;

export type TransitionComparisonResult = Readonly<{
  signalId: string;
  equal: boolean;
  differences: readonly TransitionDifference[];
  totalDifferenceCount: number;
  differenceCounts: Readonly<Record<TransitionDifferenceKind, number>>;
}>;

export type TransitionComparisonOptions = Readonly<{ signal?: AbortSignal; maxRetainedDifferences?: number }>;

type NormalizedEvent = Readonly<{ cycle: ExactSourceCycle; value: string }>;

function normalizeScalar(value: string | number): string | undefined {
  if (typeof value === "number") {
    if (value === 0) return "0";
    if (value === 1) return "1";
    return undefined;
  }
  if (value === "0" || value === "1") return value;
  if (value === "x" || value === "X") return "x";
  if (value === "z" || value === "Z") return "z";
  return undefined;
}

function fourStateDigits(value: string, width: number, format: BusValueFormat | undefined): string | undefined {
  const source = value.trim().replaceAll("_", "");
  const sized = /^(\d+)'([hdb])([0-9a-fxz?]+)$/i.exec(source);
  const prefixed = /^(0x|0b|0d)([0-9a-fxz?]+)$/i.exec(source);
  const base = sized
    ? ({ h: 16, d: 10, b: 2 }[sized[2]!.toLowerCase() as "h" | "d" | "b"]!)
    : prefixed
      ? ({ "0x": 16, "0b": 2, "0d": 10 }[prefixed[1]!.toLowerCase()]!)
    : /^[01xz]+$/i.test(source) && format === "binary" ? 2
        : /[xz]/i.test(source) && /^[01xz]+$/i.test(source) ? 2
          : /^[0-9]+$/.test(source) ? 10
            : /^[0-9a-fxz]+$/i.test(source) ? 16
              : undefined;
  if (!base) return undefined;
  const digits = (sized?.[3] ?? prefixed?.[2] ?? source).toLowerCase();
  if (/[?]/.test(digits)) return undefined;
  let bits = "";
  if (base === 2) bits = digits;
  else if (base === 16) {
    for (const digit of digits) {
      if (digit === "x" || digit === "z") bits += digit.repeat(4);
      else {
        const nibble = Number.parseInt(digit, 16);
        if (!Number.isInteger(nibble)) return undefined;
        bits += nibble.toString(2).padStart(4, "0");
      }
    }
  } else if (!/[xz]/.test(digits)) {
    try {
      bits = BigInt(digits).toString(2);
    } catch {
      return undefined;
    }
  } else {
    return undefined;
  }
  const sizedWidth = sized ? Number(sized[1]) : undefined;
  if (sizedWidth !== undefined && (!Number.isSafeInteger(sizedWidth) || sizedWidth < 1)) return undefined;
  const declaredWidth = sizedWidth ?? width;
  if (bits.length > declaredWidth || declaredWidth > width) return undefined;
  const lead = bits[0] === "x" || bits[0] === "z" ? bits[0] : "0";
  return bits.padStart(declaredWidth, lead).padStart(width, lead);
}

function normalizeAuthoredValue(value: string | number, width: number, format?: BusValueFormat): string | undefined {
  const scalar = normalizeScalar(value);
  if (width === 1) return scalar;
  if (width < 1) return undefined;
  if (typeof value === "string") {
    const compact = value.trim().toLowerCase();
    if (/^[xz]+$/.test(compact)) return compact.length === 1 ? compact.repeat(width) : compact.length === width ? compact : undefined;
  }
  try {
    const parsed = parseBusValue(value, width, format);
    if (parsed.kind === "numeric" && parsed.value !== undefined) {
      const bits = parsed.value.toString(2);
      return bits.length <= width ? bits.padStart(width, "0") : undefined;
    }
  } catch {
    return undefined;
  }
  return typeof value === "string" ? fourStateDigits(value, width, format) : undefined;
}

function validExactCycle(cycle: ExactSourceCycle): boolean {
  return cycle.denominator > 0n;
}

function unsupported(
  signalId: string,
  detail: string,
  authoredCycle?: ExactSourceCycle,
  vcdCycle?: ExactSourceCycle,
  retain = true,
): TransitionComparisonResult {
  const difference: TransitionDifference = {
    kind: "unsupported-value",
    signalId,
    detail,
    ...(authoredCycle ? { authoredCycle } : {}),
    ...(vcdCycle ? { vcdCycle } : {}),
  };
  return {
    signalId,
    equal: false,
    differences: retain ? [difference] : [],
    totalDifferenceCount: 1,
    differenceCounts: { "value-mismatch": 0, "timing-mismatch": 0, "missing-event": 0, "extra-event": 0, "unsupported-value": 1 },
  };
}

function comparisonAbort(signal: AbortSignal): DOMException {
  return signal.reason instanceof DOMException
    ? signal.reason
    : new DOMException("Simulation comparison was cancelled.", "AbortError");
}

export function createComparisonCheckpoint(signal?: AbortSignal): () => Promise<void> | undefined {
  let operations = 0;
  return () => {
    if (signal?.aborted) throw comparisonAbort(signal);
    operations += 1;
    if (operations < 1024) return undefined;
    operations = 0;
    const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    const yielded = typeof scheduler?.yield === "function"
      ? scheduler.yield()
      : typeof globalThis.MessageChannel === "function"
        ? new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
          channel.port2.postMessage(undefined);
        })
        : new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    return yielded.then(() => {
      if (signal?.aborted) throw comparisonAbort(signal);
    });
  };
}

/**
 * Compares authored transitions with one already-matched VCD signal.
 * Inputs must be sorted by cycle/time. No input or document state is mutated.
 * Timing tolerance is exactly zero source cycles; rational coordinates are
 * compared without converting them to floating point.
 */
export async function compareAuthoredTransitions(
  identity: MatchedSignalIdentity,
  authored: Iterable<AuthoredTransition>,
  vcdChanges: readonly VcdValueChange[],
  timescale: VcdTimescale,
  physicalTimebase: Pick<PhysicalTimebase, "referenceFrequencyHz"> | undefined,
  valueShape: Readonly<{ width?: number; displayFormat?: BusValueFormat }> = {},
  options: TransitionComparisonOptions = {},
): Promise<TransitionComparisonResult> {
  const checkpoint = createComparisonCheckpoint(options.signal);
  const requestedRetainedLimit = options.maxRetainedDifferences ?? 100;
  const retainedLimit = Number.isFinite(requestedRetainedLimit)
    ? Math.max(0, Math.min(100, Math.floor(requestedRetainedLimit)))
    : 100;
  if (!identity.signalId || !identity.vcdCode) {
    return unsupported(identity.signalId, "A stable canonical signal ID and matched VCD code are required.", undefined, undefined, retainedLimit > 0);
  }
  const width = valueShape.width ?? 1;
  if (!Number.isSafeInteger(width) || width < 1 || width > VCD_RESOURCE_BUDGET.variableWidthBits) {
    return unsupported(identity.signalId, `Signal width must be between 1 and ${VCD_RESOURCE_BUDGET.variableWidthBits} bits.`, undefined, undefined, retainedLimit > 0);
  }

  const authoredEvents: NormalizedEvent[] = [];
  for (const transition of authored) {
    const pause = checkpoint();
    if (pause) await pause;
    if (!Number.isSafeInteger(transition.cycle) || transition.cycle < 0) {
      return unsupported(identity.signalId, "Authored cycle must be a non-negative safe integer.", undefined, undefined, retainedLimit > 0);
    }
    const value = normalizeAuthoredValue(transition.value, width, valueShape.displayFormat);
    if (value === undefined) {
      return unsupported(identity.signalId, "Authored transition value is not a supported four-state scalar.", undefined, undefined, retainedLimit > 0);
    }
    const cycle = { numerator: BigInt(transition.cycle), denominator: 1n };
    if (authoredEvents.length > 0 && compareExactSourceCycle(authoredEvents.at(-1)!.cycle, cycle) >= 0) {
      return unsupported(identity.signalId, "Authored transitions must be strictly sorted by cycle.", undefined, undefined, retainedLimit > 0);
    }
    authoredEvents.push({ cycle, value });
  }

  const vcdEvents: NormalizedEvent[] = [];
  for (const change of vcdChanges) {
    const pause = checkpoint();
    if (pause) await pause;
    if (change.code !== identity.vcdCode) continue;
    const cycle = vcdTimestampToSourceCycles(change.timestamp, timescale, physicalTimebase);
    const value = change.kind === "scalar"
      ? (width === 1 ? normalizeScalar(change.value) : undefined)
      : change.value.length <= width
        ? change.value.padStart(width, change.value[0] === "x" || change.value[0] === "z" ? change.value[0] : "0")
        : undefined;
    if (!cycle || !validExactCycle(cycle) || value === undefined) {
      return unsupported(identity.signalId, "Matched VCD change is not a supported scalar event or has an invalid time mapping.", undefined, undefined, retainedLimit > 0);
    }
    if (vcdEvents.length > 0 && compareExactSourceCycle(vcdEvents.at(-1)!.cycle, cycle) > 0) {
      return unsupported(identity.signalId, "Matched VCD changes must be sorted by timestamp.", undefined, undefined, retainedLimit > 0);
    }
    vcdEvents.push({ cycle, value });
  }

  const differences: TransitionDifference[] = [];
  const differenceCounts: Record<TransitionDifferenceKind, number> = {
    "value-mismatch": 0,
    "timing-mismatch": 0,
    "missing-event": 0,
    "extra-event": 0,
    "unsupported-value": 0,
  };
  let totalDifferenceCount = 0;
  const addDifference = (difference: TransitionDifference): void => {
    totalDifferenceCount += 1;
    differenceCounts[difference.kind] += 1;
    if (differences.length < retainedLimit) differences.push(difference);
  };
  let authoredIndex = 0;
  let vcdIndex = 0;
  while (authoredIndex < authoredEvents.length && vcdIndex < vcdEvents.length) {
    const pause = checkpoint();
    if (pause) await pause;
    const expected = authoredEvents[authoredIndex]!;
    const actual = vcdEvents[vcdIndex]!;
    const cycleOrder = compareExactSourceCycle(expected.cycle, actual.cycle);
    if (cycleOrder === 0) {
      if (expected.value !== actual.value) {
        addDifference({
          kind: "value-mismatch",
          signalId: identity.signalId,
          authoredCycle: expected.cycle,
          vcdCycle: actual.cycle,
          authoredValue: expected.value,
          vcdValue: actual.value,
        });
      }
      authoredIndex += 1;
      vcdIndex += 1;
      continue;
    }

    if (expected.value === actual.value) {
      addDifference({
        kind: "timing-mismatch",
        signalId: identity.signalId,
        authoredCycle: expected.cycle,
        vcdCycle: actual.cycle,
        authoredValue: expected.value,
        vcdValue: actual.value,
      });
      authoredIndex += 1;
      vcdIndex += 1;
    } else if (cycleOrder < 0) {
      addDifference({
        kind: "missing-event",
        signalId: identity.signalId,
        authoredCycle: expected.cycle,
        authoredValue: expected.value,
      });
      authoredIndex += 1;
    } else {
      addDifference({
        kind: "extra-event",
        signalId: identity.signalId,
        vcdCycle: actual.cycle,
        vcdValue: actual.value,
      });
      vcdIndex += 1;
    }
  }

  while (authoredIndex < authoredEvents.length) {
    const pause = checkpoint();
    if (pause) await pause;
    const event = authoredEvents[authoredIndex++]!;
    addDifference({ kind: "missing-event", signalId: identity.signalId, authoredCycle: event.cycle, authoredValue: event.value });
  }
  while (vcdIndex < vcdEvents.length) {
    const pause = checkpoint();
    if (pause) await pause;
    const event = vcdEvents[vcdIndex++]!;
    addDifference({ kind: "extra-event", signalId: identity.signalId, vcdCycle: event.cycle, vcdValue: event.value });
  }

  if (options.signal?.aborted) throw comparisonAbort(options.signal);
  return { signalId: identity.signalId, equal: totalDifferenceCount === 0, differences, totalDifferenceCount, differenceCounts };
}
