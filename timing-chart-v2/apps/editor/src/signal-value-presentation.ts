import { formatBusValue, type SignalValueChange, type ValueSignal } from "@timing-chart-v2/schema";

type FormattableSignal = Pick<ValueSignal, "type" | "displayFormat" | "width">;
type FormattableChange = Pick<SignalValueChange, "value" | "displayLabel">;

/** Shared read-only value formatting used by the Bottom event table and Inspector. */
export function formatSignalValueChange(signal: FormattableSignal, change: FormattableChange): string {
  if (change.displayLabel !== undefined) return change.displayLabel;
  if (signal.type === "bus" && signal.displayFormat !== undefined) {
    return formatBusValue(change.value, signal.displayFormat, signal.width);
  }
  return String(change.value);
}

/** Resolve the last canonical change at or before a source cycle in O(log n). */
export function valueChangeAtCycle(signal: Pick<ValueSignal, "values">, cycle: number): SignalValueChange | undefined {
  let low = 0;
  let high = signal.values.length;
  while (low < high) {
    const middle = low + ((high - low) >> 1);
    if (signal.values[middle]!.start <= cycle) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? undefined : signal.values[low - 1];
}

/** Format the bus value active at a cycle using the same formatter as waveform and Bottom. */
export function formatBusValueAtCycle(
  signal: ValueSignal,
  cycle: number,
  displayFormat: ValueSignal["displayFormat"] = signal.displayFormat,
  width = signal.width,
): string | undefined {
  if (signal.type !== "bus") return undefined;
  const change = valueChangeAtCycle(signal, cycle);
  if (!change) return undefined;
  return formatSignalValueChange({ type: "bus", ...(displayFormat === undefined ? {} : { displayFormat }), ...(width === undefined ? {} : { width }) }, change);
}
