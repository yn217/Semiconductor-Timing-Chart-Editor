import type { ClockSignal, SignalValueChange, ValueSignal } from "@timing-chart-v2/schema";
import {
  WAVEDROM_CLOCK_TOKENS,
  WAVEDROM_DATA_TOKEN,
  WAVEDROM_STATE_TOKENS,
  WaveDromAdapterError,
  type CanonicalSignalSource,
  type WaveJsonSignal,
} from "./types.js";

const stateTokens = new Set<string>(WAVEDROM_STATE_TOKENS);

function validateSource(source: CanonicalSignalSource): void {
  if (!Number.isInteger(source.cycleCount) || source.cycleCount < 1) {
    throw new WaveDromAdapterError("INVALID_CYCLE_COUNT", "WaveDrom conversion requires a positive integer cycle count.");
  }
  for (const cycle of source.gapCycles ?? []) {
    if (!Number.isInteger(cycle) || cycle < 1 || cycle >= source.cycleCount) {
      throw new WaveDromAdapterError("INVALID_GAP_CYCLE", `Gap cycle '${cycle}' is outside the render interval.`);
    }
  }
}

function logicToken(value: string | number): string {
  const normalized = String(value).toLowerCase();
  if (stateTokens.has(normalized)) return normalized;
  const aliases: Readonly<Record<string, string>> = {
    low: "0", high: "1", false: "0", true: "1", undefined: "x",
    "high-impedance": "z", "weak-low": "d", "weak-high": "u",
  };
  const token = aliases[normalized];
  if (token) return token;
  throw new WaveDromAdapterError("UNSUPPORTED_LOGIC_VALUE", `Value '${String(value)}' has no supported WaveDrom state token.`);
}

function assertChangePoints(changes: readonly SignalValueChange[], cycleCount: number): void {
  let previous = -1;
  for (const change of changes) {
    if (!Number.isInteger(change.start) || change.start < 0 || change.start >= cycleCount || change.start <= previous) {
      throw new WaveDromAdapterError("UNSUPPORTED_CHANGE_POINT", "WaveDrom conversion requires strictly increasing integer change points inside the render interval.");
    }
    previous = change.start;
  }
}

function applyGaps(wave: string[], gaps: readonly number[] | undefined): void {
  for (const cycle of gaps ?? []) {
    if (wave[cycle] !== ".") {
      throw new WaveDromAdapterError("GAP_COLLIDES_WITH_CHANGE", `Gap at cycle ${cycle} collides with a semantic transition.`);
    }
    wave[cycle] = "|";
  }
}

function valueSignalToWaveJson(signal: ValueSignal, cycleCount: number, gaps: readonly number[] | undefined): WaveJsonSignal {
  assertChangePoints(signal.values, cycleCount);
  const wave = Array<string>(cycleCount).fill(".");
  const data: string[] = [];
  const isData = signal.type === "bus" || signal.type === "state";
  if (signal.values[0]?.start !== 0) wave[0] = "x";
  for (const change of signal.values) {
    if (isData) {
      wave[change.start] = WAVEDROM_DATA_TOKEN;
      data.push(String(change.value));
    } else {
      wave[change.start] = logicToken(change.value);
    }
  }
  applyGaps(wave, gaps);
  return data.length > 0 ? { wave: wave.join(""), data } : { wave: wave.join("") };
}

function enabledAt(changes: readonly SignalValueChange[] | undefined, cycle: number): boolean {
  if (!changes || changes.length === 0) return true;
  let value: string | number = 1;
  for (const change of changes) {
    if (change.start > cycle) break;
    value = change.value;
  }
  const normalized = String(value).toLowerCase();
  if (["1", "true", "high"].includes(normalized)) return true;
  if (["0", "false", "low"].includes(normalized)) return false;
  throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_ENABLE", `Clock enable value '${String(value)}' is not binary.`);
}

function clockToWaveJson(signal: ClockSignal, cycleCount: number, gaps: readonly number[] | undefined): WaveJsonSignal {
  const { generator } = signal;
  if (!Number.isInteger(generator.period) || generator.period < 1) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_PERIOD", "WaveDrom clock conversion requires a positive integer period.");
  }
  if (generator.duty !== 0.5) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_DUTY", "Pinned WaveDrom clock primitives support a 0.5 duty cycle only.");
  }
  if (!Number.isInteger(generator.start) || generator.start % generator.period !== 0) {
    throw new WaveDromAdapterError("UNALIGNED_CLOCK_START", "Clock start must align to its WaveDrom period.");
  }
  assertChangePoints(signal.enable ?? [], cycleCount);
  if ((signal.enable ?? []).some((change) => change.start % generator.period !== 0)) {
    throw new WaveDromAdapterError("UNALIGNED_CLOCK_ENABLE", "Clock enable changes must align to the WaveDrom period.");
  }
  if ((gaps ?? []).some((cycle) => cycle % generator.period !== 0)) {
    throw new WaveDromAdapterError("UNALIGNED_CLOCK_GAP", "Clock gaps must align to the WaveDrom period.");
  }

  const slotCount = Math.ceil(cycleCount / generator.period);
  const clockToken = generator.polarity === "positive" ? WAVEDROM_CLOCK_TOKENS[0] : WAVEDROM_CLOCK_TOKENS[1];
  const staticToken = String(generator.initial);
  const suppressed = new Set(generator.suppressedPeriods ?? []);
  const wave: string[] = [];
  let previous: string | undefined;
  for (let slot = 0; slot < slotCount; slot += 1) {
    const cycle = slot * generator.period;
    const active = cycle >= generator.start && enabledAt(signal.enable, cycle) && !suppressed.has(slot);
    const token = active ? clockToken : staticToken;
    wave.push(token === previous ? "." : token);
    previous = token;
  }
  for (const cycle of gaps ?? []) {
    const slot = cycle / generator.period;
    if (wave[slot] !== ".") throw new WaveDromAdapterError("GAP_COLLIDES_WITH_CHANGE", `Gap at cycle ${cycle} collides with a clock transition.`);
    wave[slot] = "|";
  }
  return {
    wave: wave.join(""),
    ...(generator.period === 1 ? {} : { period: generator.period }),
    ...(generator.phase === 0 ? {} : { phase: generator.phase }),
  };
}

export function toWaveJson(source: CanonicalSignalSource): WaveJsonSignal {
  validateSource(source);
  if (source.signal.type === "commentRow") {
    throw new WaveDromAdapterError("NON_WAVEFORM_SIGNAL", `Comment row '${source.signal.id}' has no WaveDrom waveform.`);
  }
  return source.signal.type === "clock"
    ? clockToWaveJson(source.signal, source.cycleCount, source.gapCycles)
    : valueSignalToWaveJson(source.signal, source.cycleCount, source.gapCycles);
}
