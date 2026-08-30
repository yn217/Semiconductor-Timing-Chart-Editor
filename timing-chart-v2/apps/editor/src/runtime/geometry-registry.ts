import type { LocalGeometryMap } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";

/** Owns document-scoped mounted SVG and extracted local-geometry registries. */
export class GeometryRegistry {
  readonly svgs = new Map<SignalId, SVGSVGElement>();
  readonly maps = new Map<SignalId, LocalGeometryMap>();

  clear(): void {
    this.svgs.clear();
    this.maps.clear();
  }

  remove(signalId: SignalId): void {
    this.svgs.delete(signalId);
    this.maps.delete(signalId);
  }
}
