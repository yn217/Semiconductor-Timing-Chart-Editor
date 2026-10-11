import type { SimulationTraceOverlayPrimitive } from "./types.js";

/** Owns SVG nodes for session-only VCD trace overlays by canonical Signal ID. */
export class SimulationTraceOverlayDomOwner {
  #layer: SVGSVGElement | undefined;
  readonly #paths = new Map<string, SVGPathElement>();

  mountAfter(reference: HTMLElement): void {
    const layer = reference.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    layer.dataset.role = "simulation-trace-overlay-surface";
    layer.setAttribute("aria-hidden", "true");
    reference.after(layer);
    this.#layer = layer;
  }

  update(primitives: readonly SimulationTraceOverlayPrimitive[]): void {
    const layer = this.#layer;
    if (!layer) throw new Error("Timing chart renderer must be mounted before Simulation trace update.");
    const active = new Set(primitives.map((primitive) => primitive.signalId));
    for (const [signalId, path] of this.#paths) {
      if (active.has(signalId)) continue;
      path.remove();
      this.#paths.delete(signalId);
    }
    for (const primitive of primitives) {
      let path = this.#paths.get(primitive.signalId);
      if (!path) {
        path = layer.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
        path.dataset.role = "simulation-trace-overlay";
        path.dataset.signalId = primitive.signalId;
        path.dataset.simulationTraceSignalId = primitive.signalId;
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#8b3fc7");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-dasharray", "5 2");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        const title = layer.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "title");
        path.append(title);
        this.#paths.set(primitive.signalId, path);
        layer.append(path);
      }
      path.dataset.sourceStart = String(primitive.sourceStart);
      path.dataset.sourceEnd = String(primitive.sourceEnd);
      path.setAttribute("aria-label", `Simulation trace for ${primitive.signalName}`);
      const title = path.querySelector("title");
      if (title?.textContent !== primitive.signalName) title?.replaceChildren(layer.ownerDocument.createTextNode(primitive.signalName));
      if (path.getAttribute("d") !== primitive.path) path.setAttribute("d", primitive.path);
    }
  }

  clear(): void {
    for (const path of this.#paths.values()) path.remove();
    this.#paths.clear();
    this.#layer?.remove();
    this.#layer = undefined;
  }
}
