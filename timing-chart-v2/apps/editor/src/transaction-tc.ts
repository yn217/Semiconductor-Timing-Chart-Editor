import type { CanonicalDocument } from "@timing-chart-v2/schema";

/**
 * #750: one presentation mapping between canonical system cycles and the Transaction Cycle (TC) shown in Transaction
 * surfaces. Canonical time is always integer system cycles; TC is display-only (cycles / cyclesPerTC).
 */
export function cyclesPerTc(document: Pick<CanonicalDocument, "transactionTimeScale">): number {
  const value = document.transactionTimeScale?.clockCyclesPerTransactionCycle ?? 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Canonical cycles -> TC display number (fractional TC allowed, never rounded away silently; trimmed to 3 decimals). */
export function cyclesToTc(cycles: number, perTc: number): number {
  return Math.round((cycles / perTc) * 1000) / 1000;
}

/** Entered TC -> canonical whole cycles (the nearest whole cycle; the echoed value shows any rounding). */
export function tcToCycles(tc: number, perTc: number): number {
  return Math.round(tc * perTc);
}

/** Quantity-aware unit word for the cycles-per-TC relationship: "1 TC = 1 cycle", "1 TC = 10 cycles" (#766). */
export const cycleUnitWord = (count: number): string => (count === 1 ? "cycle" : "cycles");

export const tcUnitLabel = (perTc: number): string => (perTc === 1 ? "cycles" : "TC");
/** Column/field label carrying its unit, e.g. "Start (TC)". */
export const tcFieldLabel = (name: string, perTc: number): string => `${name} (${tcUnitLabel(perTc)})`;
