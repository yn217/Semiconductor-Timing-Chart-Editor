import { formatBusValue, resolveEnumValue, valueSignalAcceptedToken, valueSignalWaveDomain, waveDromLogicToken, type ClockSignal, type EnumDefinition, type SignalValueChange, type ValueSignal } from "@timing-chart-v2/schema";
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

function eventToken(value: string | number): string {
  const token = valueSignalAcceptedToken("event", value);
  if (token !== undefined) return token;
  throw new WaveDromAdapterError("UNSUPPORTED_EVENT_VALUE", `Value '${String(value)}' is not a supported event marker.`);
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

function valueSignalToWaveJson(signal: ValueSignal, cycleCount: number, gaps: readonly number[] | undefined, enumDefinitions: readonly EnumDefinition[] = []): WaveJsonSignal {
  assertChangePoints(signal.values, cycleCount);
  const wave = Array<string>(cycleCount).fill(".");
  const data: string[] = [];
  const isData = valueSignalWaveDomain(signal.type) === "data";
  if (signal.values[0]?.start !== 0) wave[0] = "x";
  for (const change of signal.values) {
    if (signal.type === "event") {
      eventToken(change.value);
      wave[change.start] = WAVEDROM_DATA_TOKEN;
      data.push(String(change.value));
    } else if (isData) {
      wave[change.start] = WAVEDROM_DATA_TOKEN;
      const enumDefinition = signal.type === "state" && signal.enumId !== undefined ? enumDefinitions.find((definition) => definition.id === signal.enumId) : undefined;
      data.push(change.displayLabel ?? (enumDefinition !== undefined
        ? resolveEnumValue(enumDefinition, change.value)
        : signal.type === "bus" && signal.displayFormat !== undefined
        ? formatBusValue(change.value, signal.displayFormat, signal.width)
        : String(change.value)));
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

/** Return the enable state carried into a bounded clock window plus changes
 * inside it. Canonical changes are sorted, so a distant window must not walk
 * the complete enable history just to reconstruct its left-edge state. */
function enableChangesForWindow(changes: readonly SignalValueChange[] | undefined, start: number, end: number): readonly SignalValueChange[] {
  if (!changes || changes.length === 0) return [];
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (changes[middle]!.start <= start) low = middle + 1;
    else high = middle;
  }
  const carried = low > 0 ? changes[low - 1] : undefined;
  const result: SignalValueChange[] = carried ? [{ ...carried, start: 0 }] : [];
  for (let index = low; index < changes.length; index += 1) {
    const change = changes[index]!;
    if (change.start >= end) break;
    result.push({ ...change, start: change.start - start });
  }
  return result;
}

function expandedClockPattern(signal: ClockSignal, allowActiveInitial = false): readonly string[] {
  const { generator } = signal;
  const totalHalfCycles = generator.period * 2;
  const activeHalfCycles = Math.round(totalHalfCycles * generator.duty);
  if (!Number.isInteger(generator.period) || generator.period < 2 || activeHalfCycles <= 0 || activeHalfCycles >= totalHalfCycles || Math.abs(activeHalfCycles / totalHalfCycles - generator.duty) > 1e-9) {
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_DUTY", "Pinned WaveDrom can represent non-50% duty only when the integer period contains exact half-cycle boundaries.");
  }
  const inactiveLevel = generator.polarity === "positive" ? 0 : 1;
  if (generator.initial !== inactiveLevel && !allowActiveInitial) {
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

/** Project canonical Clock semantics onto an ordered set of visible source
 * cycles. The input list is display-slot order and may skip source cycles
 * hidden by Axis Breaks. Unlike rendering the Clock against a compressed
 * cycleCount, this keeps generator start, gating and suppression ordinals in
 * canonical source time. */
export function toWaveJsonMappedClock(source: CanonicalSignalSource, sourceCycles: readonly number[]): WaveJsonSignal {
  validateSource(source);
  const signal = source.signal;
  if (signal.type !== "clock") throw new WaveDromAdapterError("NON_CLOCK_SIGNAL", "Mapped Clock conversion requires a Clock Signal.");
  if (sourceCycles.length === 0) throw new WaveDromAdapterError("EMPTY_CLOCK_WINDOW", "Mapped Clock conversion requires at least one visible source cycle.");
  const { generator } = signal;
  if (!Number.isInteger(generator.period) || generator.period < 1) throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_PERIOD", "WaveDrom clock conversion requires a positive integer period.");
  if (!Number.isInteger(generator.phase * 2)) throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_PHASE", "WaveDrom geometry requires phase aligned to a half cycle.");
  if (!Number.isInteger(generator.start) || generator.start < 0 || generator.start % generator.period !== 0) throw new WaveDromAdapterError("UNALIGNED_CLOCK_START", "Clock start must align to its WaveDrom period.");
  assertChangePoints(signal.enable ?? [], source.cycleCount);
  if ((signal.enable ?? []).some((change) => change.start % generator.period !== 0)) throw new WaveDromAdapterError("UNALIGNED_CLOCK_ENABLE", "Clock enable changes must align to the generator period.");
  let previousCycle = -1;
  for (const cycle of sourceCycles) {
    if (!Number.isInteger(cycle) || cycle < 0 || cycle >= source.cycleCount || cycle <= previousCycle) {
      throw new WaveDromAdapterError("INVALID_CLOCK_SOURCE_CYCLES", "Mapped Clock source cycles must be strictly increasing and inside the canonical timeline.");
    }
    previousCycle = cycle;
  }

  const pattern = generator.period === 1 && generator.duty === 0.5
    ? generator.polarity === "positive" ? "p" : "n"
    : expandedClockPattern(signal, generator.duty === 0.5)[0]!;
  const staticLevel = String(generator.initial);
  const suppressed = new Set(generator.suppressedPeriods ?? []);
  const enable = signal.enable ?? [];
  const enableValueAt = (slotStart: number): string | number => {
    let low = 0;
    let high = enable.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (enable[middle]!.start <= slotStart) low = middle + 1;
      else high = middle;
    }
    return low === 0 ? 1 : enable[low - 1]!.value;
  };
  const normalizeEnabled = (value: string | number): boolean => {
    const normalized = String(value).toLowerCase();
    if (["1", "true", "high"].includes(normalized)) return true;
    if (["0", "false", "low"].includes(normalized)) return false;
    throw new WaveDromAdapterError("UNSUPPORTED_CLOCK_ENABLE", `Clock enable value '${String(value)}' is not binary.`);
  };
  const firstCycle = sourceCycles[0]!;
  const firstSlotStart = Math.floor(firstCycle / generator.period) * generator.period;
  let enableLow = 0;
  let enableHigh = enable.length;
  while (enableLow < enableHigh) {
    const middle = (enableLow + enableHigh) >>> 1;
    if (enable[middle]!.start <= firstSlotStart) enableLow = middle + 1;
    else enableHigh = middle;
  }
  let enableIndex = enableLow;
  let enabled: string | number = enableIndex === 0 ? 1 : enable[enableIndex - 1]!.value;
  const enabledAt = (slotStart: number): boolean => {
    while (enableIndex < enable.length && enable[enableIndex]!.start <= slotStart) {
      enabled = enable[enableIndex]!.value;
      enableIndex += 1;
    }
    return normalizeEnabled(enabled);
  };
  const tokenAt = (cycle: number, allowAdvance: boolean): string => {
    const slotStart = Math.floor(cycle / generator.period) * generator.period;
    const isEnabled = allowAdvance ? enabledAt(slotStart) : normalizeEnabled(enableValueAt(slotStart));
    const pulseSlot = slotStart < generator.start ? -1 : (slotStart - generator.start) / generator.period;
    const active = slotStart >= generator.start && isEnabled && !suppressed.has(pulseSlot);
    return active ? (pattern[cycle - slotStart] ?? staticLevel) : staticLevel;
  };
  const endLevel = (token: string, previous: 0 | 1): 0 | 1 => token === "p" ? 0 : token === "n" ? 1 : token === "0" || token === "1" ? Number(token) as 0 | 1 : previous;
  let level: 0 | 1 = Number(generator.initial) as 0 | 1;
  if (firstCycle > 0) level = endLevel(tokenAt(firstCycle - 1, false), level);
  const initial = level;
  const wave: string[] = [];
  for (const cycle of sourceCycles) {
    const token = tokenAt(cycle, true);
    if (token === "0" || token === "1") {
      const target = Number(token) as 0 | 1;
      wave.push(level === target ? "." : token);
    } else wave.push(token);
    const emitted = wave[wave.length - 1]!;
    level = endLevel(emitted, level);
  }
  return {
    wave: wave.join(""),
    ...(generator.phase === 0 ? {} : { phase: generator.phase }),
    clock: { expanded: true, polarity: generator.polarity, initial },
  };
}

function expandedClockToWaveJson(signal: ClockSignal, cycleCount: number, gaps: readonly number[] | undefined): WaveJsonSignal {
  const { generator } = signal;
  const pattern = expandedClockPattern(signal)[0]!;
  const staticToken = String(generator.initial);
  const timelineSlotCount = Math.ceil(cycleCount / generator.period);
  const wave: string[] = [];
  const enabled = createEnableReader(signal.enable);
  let heldLevel: string | undefined;
  for (let slot = 0; slot < timelineSlotCount; slot += 1) {
    const cycle = slot * generator.period;
    const pulseSlot = cycle < generator.start ? -1 : Math.round((cycle - generator.start) / generator.period);
    const active = cycle >= generator.start && enabled(cycle) && !(generator.suppressedPeriods ?? []).includes(pulseSlot);
    const slotLength = Math.min(generator.period, cycleCount - wave.length);
    if (active) {
      const slotWave = pattern.slice(0, slotLength);
      for (const token of slotWave) {
        wave.push(token);
        if (token === "0" || token === "1") heldLevel = token;
        else if (token === "p") heldLevel = "1";
        else if (token === "n") heldLevel = "0";
      }
      continue;
    }

    // A disabled/suppressed clock holds its current level. Emit a value only
    // when that level actually changes; WaveDrom continuation dots preserve
    // the held state without inventing repeated value boundaries.
    for (let offset = 0; offset < slotLength; offset += 1) {
      const token = heldLevel === staticToken ? "." : staticToken;
      wave.push(token);
      heldLevel = staticToken;
    }
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
    const pulseSlot = cycle < generator.start ? -1 : Math.round((cycle - generator.start) / generator.period);
    const active = cycle >= generator.start && enabled(cycle) && !suppressed.has(pulseSlot);
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

function clockToWaveJsonWindow(source: CanonicalSignalSource, start: number, end: number): WaveJsonSignal {
  const signal = source.signal as ClockSignal;
  const { generator } = signal;
  if (start % generator.period !== 0) {
    throw new WaveDromAdapterError("UNALIGNED_CLOCK_WINDOW", "Bounded clock windows must align to the clock period.");
  }
  const inactive = generator.polarity === "positive" ? 0 : 1;
  const active = generator.polarity === "positive" ? 1 : 0;
  const localEnableChanges = enableChangesForWindow(signal.enable, start, end);
  const enableAt = createEnableReader(localEnableChanges);
  const localPulse = Math.floor((start - generator.start) / generator.period);
  const suppressed = new Set(generator.suppressedPeriods ?? []);
  const started = start >= generator.start;
  const firstActive = started && enableAt(0) && !suppressed.has(localPulse);
  // Preserve the canonical enable state at the bounded window's left edge.
  // An omitted local change must not be interpreted by createEnableReader as
  // the default HIGH state.
  const enableAtLeftEdge = enableAt(0) ? 1 : 0;
  const localEnable = localEnableChanges[0]?.start === 0
    ? localEnableChanges
    : [{ start: 0, value: enableAtLeftEdge }, ...localEnableChanges];
  const localGeneratorStart = started ? 0 : generator.start - start;
  const localSignal: ClockSignal = {
    ...signal,
    enable: localEnable,
    generator: {
      ...generator,
      start: localGeneratorStart,
      // Non-50% duty expands per period and requires the generator's own inactive initial level; only the plain 50% clock
      // derives its first token from the window-left-edge state.
      initial: generator.duty === 0.5 ? (firstActive ? active : inactive) : generator.initial,
      suppressedPeriods: started ? [...suppressed].filter((period) => period >= localPulse).map((period) => period - localPulse) : [...suppressed],
    },
  };
  return { ...clockToWaveJson(localSignal, end - start, (source.gapCycles ?? []).filter((cycle) => cycle > start && cycle < end).map((cycle) => cycle - start)), sourceWindow: { start, end } };
}

export function toWaveJson(source: CanonicalSignalSource): WaveJsonSignal {
  validateSource(source);
  if (source.signal.type === "commentRow") {
    throw new WaveDromAdapterError("NON_WAVEFORM_SIGNAL", `Comment row '${source.signal.id}' has no WaveDrom waveform.`);
  }
  return source.signal.type === "clock"
    ? clockToWaveJson(source.signal, source.cycleCount, source.gapCycles)
    : valueSignalToWaveJson(source.signal, source.cycleCount, source.gapCycles, source.enumDefinitions);
}

/** Convert a bounded source interval, reconstructing the value at its left edge. */
/**
 * The canonical value changes a bounded window converts, in WaveJSON data
 * order: the value carried into the window followed by every change inside
 * it. Canonical value changes are strictly ordered, so an upper bound finds
 * the carried value without walking the entire history.
 */
function valueChangesInWindow(changes: readonly SignalValueChange[], start: number, end: number): readonly SignalValueChange[] {
  let low = 0;
  let high = changes.length;
  while (low < high) {
    const middle = low + ((high - low) >>> 1);
    if (changes[middle]!.start <= start) low = middle + 1;
    else high = middle;
  }
  const current = changes[low - 1] ?? changes[0];
  if (!current) throw new WaveDromAdapterError("EMPTY_SIGNAL_VALUES", "Bounded value conversion requires at least one canonical value.");
  const selected = [current];
  for (let index = low; index < changes.length; index += 1) {
    const change = changes[index]!;
    if (change.start >= end) break;
    selected.push(change);
  }
  return selected;
}

/**
 * Semantic values index-aligned with the `data` labels emitted by
 * {@link toWaveJsonWindow} for the same value changes and window. Label
 * binding is positional, so a bounded render must not receive the complete
 * document history (whose index 0 is the first change of the whole Signal).
 */
export function semanticValuesForWindow(changes: readonly SignalValueChange[], start: number, end: number): readonly string[] {
  return valueChangesInWindow(changes, start, end).map((change) => String(change.value));
}

export function toWaveJsonWindow(source: CanonicalSignalSource, start: number, end: number, semanticWindow: Readonly<{ start: number; end: number }> = { start, end }, geometryWindow: Readonly<{ start: number; end: number }> = semanticWindow): WaveJsonSignal {
  validateSource(source);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.cycleCount) {
    throw new WaveDromAdapterError("INVALID_CYCLE_WINDOW", "WaveDrom conversion requires a non-empty in-bounds source window.");
  }
  if (source.signal.type === "commentRow") throw new WaveDromAdapterError("NON_WAVEFORM_SIGNAL", `Comment row '${source.signal.id}' has no WaveDrom waveform.`);
  const geometryMetadata = geometryWindow.start === semanticWindow.start && geometryWindow.end === semanticWindow.end ? {} : { geometryWindow };
  if (source.signal.type === "clock") return { ...clockToWaveJsonWindow(source, start, end), sourceWindow: semanticWindow, ...geometryMetadata, displayWindow: { start, end } };
  const localChanges = valueChangesInWindow(source.signal.values, start, end)
    .map((change, index) => ({ start: index === 0 ? 0 : change.start - start, value: change.value, ...(change.displayLabel === undefined ? {} : { displayLabel: change.displayLabel }) }));
  const localSignal = { ...source.signal, values: localChanges };
  const localGaps = (source.gapCycles ?? []).filter((cycle) => cycle > start && cycle < end).map((cycle) => cycle - start);
  return { ...valueSignalToWaveJson(localSignal, end - start, localGaps, source.enumDefinitions), sourceWindow: semanticWindow, ...geometryMetadata, displayWindow: { start, end } };
}
