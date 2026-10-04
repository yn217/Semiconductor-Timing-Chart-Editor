import { resolveSourcePosition, type DisplayTimeMapping } from "./time-mapping.js";
import type { PhysicalTimebase } from "@timing-chart-v2/schema";

export interface SemanticCursorState { readonly a?: number; readonly b?: number }
export interface CursorDelta { readonly cycles?: number; readonly displayCycles?: number; readonly physicalTime?: number }

const SECONDS_PER_UNIT: Readonly<Record<PhysicalTimebase["unit"], number>> = { s: 1, ms: 1e-3, us: 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15 };

export function physicalTimeForCycles(cycles: number, timebase: PhysicalTimebase): number {
  return cycles / timebase.referenceFrequencyHz / SECONDS_PER_UNIT[timebase.unit];
}

export function formatPhysicalTime(cycles: number, timebase: PhysicalTimebase): string {
  const value = physicalTimeForCycles(cycles, timebase);
  return `${Number(value.toPrecision(4))} ${timebase.unit}`;
}

export function cursorDelta(state: SemanticCursorState, physicalTimePerCycle?: number): CursorDelta {
  if (state.a === undefined || state.b === undefined) return {};
  const cycles = state.b - state.a;
  return { cycles, ...(physicalTimePerCycle === undefined ? {} : { physicalTime: cycles * physicalTimePerCycle }) };
}

export function projectCursor(state: SemanticCursorState, mapping: DisplayTimeMapping): { readonly a?: number; readonly b?: number } {
  const project = (source: number | undefined) => source === undefined ? undefined : resolveSourcePosition(mapping, source, "omit");
  const a = project(state.a); const b = project(state.b);
  return { ...(a === undefined ? {} : { a }), ...(b === undefined ? {} : { b }) };
}

export function displayCursorDelta(state: SemanticCursorState, mapping: DisplayTimeMapping): CursorDelta {
  const projected = projectCursor(state, mapping);
  return projected.a === undefined || projected.b === undefined ? {} : { displayCycles: projected.b - projected.a };
}
