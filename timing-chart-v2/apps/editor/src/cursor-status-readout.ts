import type { CursorDelta } from "@timing-chart-v2/projection";
import { formatPhysicalTime } from "@timing-chart-v2/projection";
import type { PhysicalTimebase } from "@timing-chart-v2/schema";

/** Pure textual counterpart to the cursor position indicator, including the Document's optional physical-time basis. */
export function cursorStatusReadout(a: number | undefined, b: number | undefined, delta: CursorDelta, timebase: PhysicalTimebase | undefined): string | undefined {
  if (a === undefined && b === undefined) return undefined;
  const positions = `A ${a ?? "—"} · B ${b ?? "—"}`;
  if (delta.cycles === undefined) return `Cursor: ${positions}`;
  const physicalTime = timebase ? ` (${formatPhysicalTime(delta.cycles, timebase)})` : "";
  return `Cursor: ${positions} · Δ ${delta.cycles} cycles${physicalTime}`;
}
