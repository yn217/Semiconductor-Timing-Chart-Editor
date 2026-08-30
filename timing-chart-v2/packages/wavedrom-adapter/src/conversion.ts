import { valueSignalWaveDomain, waveDromLogicToken, type ClockSignal, type SignalValueChange, type ValueSignal } from "@timing-chart-v2/schema";
import {
  WAVEDROM_CLOCK_TOKENS,
  WAVEDROM_DATA_TOKEN,
  WAVEDROM_STATE_TOKENS,
  WaveDromAdapterError,
  type CanonicalSignalSource,
  type WaveJsonSignal,
} from "./types.js";

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

function logicToken(type: ValueSignal["type"], value: string | number): string {
  const token = waveDromLogicToken(type, value);
  if (token !== undefined) return token;
  throw new WaveDromAdapterError("UNSUPPORTED_LOGIC_VALUE", `Value '${String(value)}' has no supported WaveDrom state token for ${type}.`);
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
  const isData = valueSignalWaveDomain(signal.type) === "data";
  if (signal.values[0]?.start !== 0) wave[0] = "x";
  for (const change of signal.values) {
    if (isData) {
      wave[change.start] = WAVEDROM_DATA_TOKEN;
      data.push(String(change.value));
    } else {
      wave[change.start] = logicToken(signal.type, change.value);
    }
  }
  applyGaps(wave, gaps);
  return data.length > 0 ? { wave: wave.join(""), data } : { wave: wave.join("") };
}

function createEnableReader(changes: readonly SignalValueChange[] | undefined): (cycle: number) => boolean {
  if (!changes || changes.length === 0) return () => true;
  let activeIndex = -1;
  return (cycle) => {
    while (activeIndex + 1 < changes.length && changes[activeIndex + 1]!.start <= cycle) activeIndex += 1;
    const value: string | number = activeIndex < 0 ? 1 : changes[activeIndex]!.value;
    const normalized = String(value).toLowerCase();
    if (["1", "true", "high"].includes(normalized)) return true;
    if (["0", "false", "low"].includes(normalized)) return false;
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_ENABLE", `Clock enable value '${String(value)}' is not binary.`);
  };
}

function expandedClockPattern(signal: ClockSignal): readonly string[] {
  const { generator } = signal;
  const totalHalfCycles = generator.period * 2;
  const activeHalfCycles = Math.round(totalHalfCycles * generator.duty);
  if (!Number.isInteger(generator.period) || generator.period < 2 || activeHalfCycles <= 0 || activeHalfCycles >= totalHalfCycles || Math.abs(activeHalfCycles / totalHalfCycles - generator.duty) > 1e-9) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_DUTY", "Pinned WaveDrom can represent non-50% duty only when the integer period contains exact half-cycle boundaries.");
  }
  const inactiveLevel = generator.polarity === "positive" ? 0 : 1;
  if (generator.initial !== inactiveLevel) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_DUTY_INITIAL", "Non-50% duty expansion requires the generator initial level to be the inactive clock level.");
  }
  const inactiveToken = String(inactiveLevel);
  const activeToken = generator.polarity === "positive" ? "p" : "n";
  const fullActive = activeToken === "p" ? "1" : "0";
  const fullInactive = inactiveToken;
  const activeFullCycles = Math.floor(activeHalfCycles / 2);
  const inactiveHalfCycles = totalHalfCycles - activeHalfCycles;
  const inactiveFullCycles = Math.floor(inactiveHalfCycles / 2);
  return Object.freeze([
    `${fullActive.repeat(activeFullCycles)}${activeHalfCycles % 2 === 1 ? activeToken : ""}${fullInactive.repeat(inactiveFullCycles)}`,
  ]);
}

function expandedClockToWaveJson(signal: ClockSignal, cycleCount: number, gaps: readonly number[] | undefined): WaveJsonSignal {
  const { generator } = signal;
  const pattern = expandedClockPattern(signal)[0]!;
  const staticToken = String(generator.initial);
  const slotCount = Math.ceil(cycleCount / generator.period);
  const wave: string[] = [];
  const enabled = createEnableReader(signal.enable);
  for (let slot = 0; slot < slotCount; slot += 1) {
    const cycle = slot * generator.period;
    const active = cycle >= generator.start && enabled(cycle) && !(generator.suppressedPeriods ?? []).includes(slot);
    const slotWave = active ? pattern : staticToken.repeat(generator.period);
    wave.push(...slotWave.slice(0, Math.min(generator.period, cycleCount - wave.length)).split(""));
  }
  for (const cycle of gaps ?? []) {
    if (cycle % generator.period !== 0) throw new WaveDromAdapterError("UNALIGNED_CLOCK_GAP", "Clock gaps must align to the WaveDrom period.");
    if (cycle < wave.length) wave[cycle] = "|";
  }
  return {
    wave: wave.join(""),
    ...(generator.phase === 0 ? {} : { phase: generator.phase }),
    clock: { expanded: true, polarity: generator.polarity, initial: generator.initial },
  };
}

function clockToWaveJson(signal: ClockSignal, cycleCount: number, gaps: readonly number[] | undefined): WaveJsonSignal {
  const { generator } = signal;
  if (!Number.isInteger(generator.period) || generator.period < 1) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_PERIOD", "WaveDrom clock conversion requires a positive integer period.");
  }
  if (!Number.isInteger(generator.phase * 2)) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_PHASE", "WaveDrom geometry requires phase aligned to a half cycle.");
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
  if (generator.duty !== 0.5) return expandedClockToWaveJson(signal, cycleCount, gaps);

  const slotCount = Math.ceil(cycleCount / generator.period);
  const clockToken = generator.polarity === "positive" ? WAVEDROM_CLOCK_TOKENS[0] : WAVEDROM_CLOCK_TOKENS[1];
  const staticToken = String(generator.initial);
  const suppressed = new Set(generator.suppressedPeriods ?? []);
  const wave: string[] = [];
  const enabled = createEnableReader(signal.enable);
  let previous: string | undefined;
  for (let slot = 0; slot < slotCount; slot += 1) {
    const cycle = slot * generator.period;
    const active = cycle >= generator.start && enabled(cycle) && !suppressed.has(slot);
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
