import type { PhysicalTimebase } from "@timing-chart-v2/schema";

export type SimulationTimeUnit = PhysicalTimebase["unit"];

/** The VCD integer multiplier and SI unit from its $timescale declaration. */
export interface VcdTimescale {
  readonly magnitude: bigint;
  readonly unit: SimulationTimeUnit;
}

/** Exact source-cycle coordinate. Kept rational so zero-tolerance comparisons
 * do not depend on floating-point rounding of large timestamps. */
export interface ExactSourceCycle {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const UNIT_SECONDS_POWER: Readonly<Record<SimulationTimeUnit, number>> = {
  s: 0,
  ms: -3,
  us: -6,
  ns: -9,
  ps: -12,
  fs: -15,
};

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function decimalRational(value: number): ExactSourceCycle | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const text = value.toString().toLowerCase();
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) return undefined;
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? 0) - fraction.length;
  let numerator = BigInt(`${match[1]}${fraction}`);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function normalize(numerator: bigint, denominator: bigint): ExactSourceCycle {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/**
 * Converts a VCD timestamp to the authored document's source-cycle domain.
 *
 * Formula: timestamp × VCD timescale (seconds) × document referenceFrequencyHz.
 * The PhysicalTimebase display unit does not affect the mapping; its frequency
 * defines the physical duration of one authored source cycle.
 */
export function vcdTimestampToSourceCycles(
  timestamp: bigint,
  timescale: VcdTimescale,
  physicalTimebase: Pick<PhysicalTimebase, "referenceFrequencyHz"> | undefined,
): ExactSourceCycle | undefined {
  if (timestamp < 0n || timescale.magnitude <= 0n || !physicalTimebase) return undefined;
  const frequency = decimalRational(physicalTimebase.referenceFrequencyHz);
  if (!frequency) return undefined;
  const unitPower = UNIT_SECONDS_POWER[timescale.unit];
  if (unitPower === undefined) return undefined;
  let numerator = timestamp * timescale.magnitude * frequency.numerator;
  let denominator = frequency.denominator;
  if (unitPower >= 0) numerator *= 10n ** BigInt(unitPower);
  else denominator *= 10n ** BigInt(-unitPower);
  return normalize(numerator, denominator);
}

export function compareExactSourceCycle(left: ExactSourceCycle, right: ExactSourceCycle): -1 | 0 | 1 {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

/** Converts an exact cycle coordinate for geometry/UI APIs; retain the rational
 * alongside it when checking equality or a zero-cycle tolerance. */
export function exactSourceCycleToNumber(value: ExactSourceCycle): number {
  return Number(value.numerator) / Number(value.denominator);
}
