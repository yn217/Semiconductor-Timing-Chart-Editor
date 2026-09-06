import { resolveSourcePosition, type DisplayTimeMapping } from "./time-mapping.js";

export interface SemanticCursorState { readonly a?: number; readonly b?: number }
export interface CursorDelta { readonly cycles?: number; readonly displayCycles?: number }

export function cursorDelta(state: SemanticCursorState): CursorDelta {
  if (state.a === undefined || state.b === undefined) return {};
  return { cycles: state.b - state.a };
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
