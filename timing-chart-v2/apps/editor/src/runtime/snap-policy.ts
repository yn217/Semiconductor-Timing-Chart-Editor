import type { SnapKind } from "@timing-chart-v2/geometry";
import type { AnnotationType } from "@timing-chart-v2/schema";

export function preferredSnapKinds(type: AnnotationType): readonly SnapKind[] {
  if (type === "dependency" || type === "arrow") return ["clock-edge", "signal-transition", "bus-transition", "value-boundary", "cycle-boundary"];
  if (type === "verticalLine" || type === "marker") return ["cycle-boundary", "clock-edge"];
  return ["annotation", "marker", "value-boundary", "cycle-boundary", "cycle-center", "signal-row"];
}
