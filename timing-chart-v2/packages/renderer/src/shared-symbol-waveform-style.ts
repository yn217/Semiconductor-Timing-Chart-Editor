const waveformUseStyleStates = new WeakMap<SVGSVGElement, { color: string; defs: SVGDefsElement; originalHrefByUse: Map<SVGUseElement, string> }>();
let nextWaveformStyleSymbolId = 0;

/** Recolors WaveDrom's shared-symbol SVG form without mutating its global sprite. */
export function applySharedSymbolWaveformColor(svg: SVGSVGElement, color: string | undefined, classes: ReadonlySet<string>): void {
  const existing = waveformUseStyleStates.get(svg);
  if (!color) {
    if (!existing) return;
    for (const [use, href] of existing.originalHrefByUse) {
      use.setAttribute("href", href);
      use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
    }
    existing.defs.remove();
    waveformUseStyleStates.delete(svg);
    return;
  }
  if (existing?.color === color) return;
  const sprite = svg.ownerDocument.querySelector<SVGSVGElement>("svg[data-wavedrom-definition-sprite]");
  if (!sprite) return;
  const state = existing ?? {
    color,
    defs: svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs"),
    originalHrefByUse: new Map<SVGUseElement, string>(),
  };
  state.color = color;
  state.defs.setAttribute("data-waveform-style-defs", "");
  if (!state.defs.isConnected) svg.insertBefore(state.defs, svg.firstChild);
  else state.defs.replaceChildren();
  const styledIds = new Map<string, string>();
  for (const use of Array.from(svg.querySelectorAll<SVGUseElement>("use"))) {
    const currentHref = use.getAttribute("href") ?? use.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
    const sourceHref = state.originalHrefByUse.get(use) ?? currentHref;
    state.originalHrefByUse.set(use, sourceHref);
    if (!sourceHref.startsWith("#")) continue;
    const sourceId = sourceHref.slice(1);
    let styledId = styledIds.get(sourceId);
    if (!styledId) {
      const source = sprite.querySelector<SVGGElement>(`#${CSS.escape(sourceId)}`);
      if (!source) continue;
      const clone = source.cloneNode(true) as SVGGElement;
      styledId = `wave-style-symbol-${++nextWaveformStyleSymbolId}`;
      clone.id = styledId;
      for (const node of [clone, ...Array.from(clone.querySelectorAll<SVGElement>("*"))]) {
        if (Array.from(node.classList).some((className) => classes.has(className))) node.style.setProperty("stroke", color, "important");
      }
      state.defs.append(clone);
      styledIds.set(sourceId, styledId);
    }
    const styledHref = `#${styledId}`;
    use.setAttribute("href", styledHref);
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", styledHref);
  }
  waveformUseStyleStates.set(svg, state);
}
