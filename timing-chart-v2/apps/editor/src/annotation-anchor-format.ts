import type { SemanticAnchor, SignalId } from "@timing-chart-v2/schema";

const POINT_SUFFIX: Readonly<Record<SemanticAnchor["point"], string>> = {
  "cycle-start": "",
  "cycle-center": " · center",
  "cycle-end": " · end",
  "transition-start": " · transition start",
  "transition-center": " · transition center",
  "transition-end": " · transition end",
  "rising-edge": " ↑",
  "falling-edge": " ↓",
  "value-start": " · value start",
  "value-center": " · value center",
  "row-center": " · row",
};

/** One semantic anchor formatter for the Bottom list and Inspector summary. */
export function formatAnnotationAnchor(
  anchor: SemanticAnchor | undefined,
  signalNames: ReadonlyMap<SignalId, string>,
): string {
  if (anchor === undefined) return "—";
  const point = POINT_SUFFIX[anchor.point];
  if (anchor.signalId === undefined) return `Cycle ${anchor.cycle}${point}`;
  const signalName = signalNames.get(anchor.signalId) || anchor.signalId;
  return `${signalName} @ ${anchor.cycle}${point}`;
}
