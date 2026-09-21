import type { TransactionPhase } from "@timing-chart-v2/schema";
import { cyclesToTc, tcUnitLabel } from "./transaction-tc.js";

/**
 * #751: the Phase draft model shared by the Bottom editor and the Inspector.
 *  - Identity: every draft row carries a stable `uid` (committed rows keep their source index as `c<index>`, new rows get `n<seq>`).
 *    Edits and deletes resolve the uid, never the displayed (Start-sorted) position.
 *  - Order: the visible order is the Start-time projection (`startOrder`), independent of edit order.
 *  - Validation: ONE validator with structured codes over the canonical source cycles (TC input is converted to whole source cycles
 *    before validation), consumed by both surfaces.
 */
export interface DraftPhase extends TransactionPhase { readonly uid: string }

let newPhaseSequence = 0;
export const newPhaseUid = (): string => { newPhaseSequence += 1; return `n${newPhaseSequence}`; };
export const toDraftPhases = (phases: readonly TransactionPhase[]): DraftPhase[] => phases.map((phase, index) => ({ name: phase.name, start: phase.start, end: phase.end, uid: `c${index}` }));
export const stripPhaseUid = (phase: TransactionPhase & { readonly uid?: string }): TransactionPhase => ({ name: phase.name, start: phase.start, end: phase.end });
/** Start-time projection: Start, then End, then uid (stable). */
export const startOrder = (a: DraftPhase, b: DraftPhase): number => a.start - b.start || a.end - b.end || a.uid.localeCompare(b.uid);

export type PhaseProblemCode = "PHASE_NAME_REQUIRED" | "PHASE_NOT_WHOLE_CYCLE" | "PHASE_EMPTY_RANGE" | "PHASE_OUT_OF_RANGE" | "PHASE_OVERLAP" | "PHASES_NONE" | "PHASE_UNCOVERED";
export interface PhaseProblem { readonly code: PhaseProblemCode; readonly severity: "error" | "warning"; readonly message: string; readonly uid?: string }
export interface PhaseValidation {
  readonly problems: readonly PhaseProblem[];
  /** First problem that must block Apply (errors only). */
  readonly blocking: PhaseProblem | undefined;
  /** The single coverage/warning line shown under the timeline (also errors that make coverage meaningless). */
  readonly status: PhaseProblem | undefined;
}

export function validatePhases(rows: readonly (TransactionPhase & { readonly uid?: string })[], range: { readonly start: number; readonly end: number }, perTc: number): PhaseValidation {
  const problems: PhaseProblem[] = [];
  const unit = tcUnitLabel(perTc);
  const label = (cycles: number) => `${cyclesToTc(cycles, perTc)}`;
  const at = (phase: { readonly uid?: string }) => (phase.uid === undefined ? {} : { uid: phase.uid });
  for (const phase of rows) {
    if (!phase.name.trim()) problems.push({ code: "PHASE_NAME_REQUIRED", severity: "error", message: "Every Phase needs a name.", ...at(phase) });
    if (!Number.isInteger(phase.start) || !Number.isInteger(phase.end)) { problems.push({ code: "PHASE_NOT_WHOLE_CYCLE", severity: "error", message: `Phase "${phase.name.trim() || "(unnamed)"}" does not map to whole source cycles.`, ...at(phase) }); continue; }
    if (phase.start >= phase.end) problems.push({ code: "PHASE_EMPTY_RANGE", severity: "error", message: `Phase "${phase.name.trim() || "(unnamed)"}" must end after it starts (${label(phase.start)}–${label(phase.end)} ${unit}).`, ...at(phase) });
    else if (phase.start < range.start || phase.end > range.end) problems.push({ code: "PHASE_OUT_OF_RANGE", severity: "error", message: `Phase "${phase.name.trim() || "(unnamed)"}" must lie within the Transaction range ${label(range.start)}–${label(range.end)} ${unit}.`, ...at(phase) });
  }
  const ordered = [...rows].filter((phase) => Number.isInteger(phase.start) && Number.isInteger(phase.end)).sort((a, b) => a.start - b.start || a.end - b.end);
  if (rows.length === 0) problems.push({ code: "PHASES_NONE", severity: "warning", message: "No phases defined" });
  if (ordered.some((phase, index) => index > 0 && phase.start < ordered[index - 1]!.end)) problems.push({ code: "PHASE_OVERLAP", severity: "warning", message: "Phases overlap" });
  const covered = rows.reduce((sum, phase) => sum + Math.max(0, phase.end - phase.start), 0);
  const duration = range.end - range.start;
  if (rows.length > 0 && covered < duration && !problems.some((problem) => problem.code === "PHASE_OVERLAP")) problems.push({ code: "PHASE_UNCOVERED", severity: "warning", message: `Uncovered time: ${cyclesToTc(duration - covered, perTc)} ${perTc === 1 ? "cycles" : "TC"}` });
  const blocking = problems.find((problem) => problem.severity === "error");
  const outside = problems.find((problem) => problem.code === "PHASE_OUT_OF_RANGE");
  const status = outside !== undefined ? { ...outside, message: "Phase exceeds the Transaction range" } : problems.find((problem) => problem.code === "PHASES_NONE" || problem.code === "PHASE_OVERLAP" || problem.code === "PHASE_UNCOVERED");
  return { problems, blocking, status };
}
