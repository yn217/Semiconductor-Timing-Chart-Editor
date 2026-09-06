/** Read the rendered SVG scale from actual browser screen geometry. */
export function referenceSvgScreenScale(svg: SVGSVGElement | undefined, currentZoom: number): number | undefined {
  if (!svg || !Number.isFinite(currentZoom) || currentZoom <= 0) return undefined;
  const viewBoxWidth = svg.viewBox.baseVal.width;
  // Force the browser to resolve any width/transform writes made earlier in
  // this presentation pass before sampling the screen transform.
  svg.getBoundingClientRect();
  const matrix = svg.getScreenCTM();
  if (!Number.isFinite(viewBoxWidth) || viewBoxWidth <= 0 || !matrix || !Number.isFinite(matrix.a) || matrix.a <= 0) return undefined;
  const scale = matrix.a / currentZoom;
  return Number.isFinite(scale) && scale > 0 ? scale : undefined;
}
