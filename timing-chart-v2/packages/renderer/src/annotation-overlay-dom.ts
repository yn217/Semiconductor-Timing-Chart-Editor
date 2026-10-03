import { ANNOTATION_LABEL_LINE_HEIGHT, ANNOTATION_LABEL_MAX_WIDTH, wrapAnnotationLabel } from "@timing-chart-v2/geometry";
import type { AnnotationOverlayPrimitive } from "./types.js";

/** Annotation overlay DOM: identity/semantic dataset sync, shape + label rendering and the free-form presentation/text style parsers. */
function syncOverlayIdentity(owner: HTMLElement, primitive: AnnotationOverlayPrimitive): void {
  owner.dataset.annotationType = primitive.type;
  owner.dataset.annotationShape = primitive.shape;
  owner.dataset.visible = String(primitive.visible);
  owner.dataset.lineType = primitive.lineType ?? "straight";
  owner.dataset.arrowhead = primitive.arrowhead ?? "none";
  if (primitive.measurementLane !== undefined) owner.dataset.measurementLane = String(primitive.measurementLane);
  else delete owner.dataset.measurementLane;
  if (primitive.measurementLayout) owner.dataset.measurementArrowLayout = primitive.measurementLayout.arrowLayout;
  else delete owner.dataset.measurementArrowLayout;
  if (primitive.sourceSignalId) owner.dataset.sourceSignalId = primitive.sourceSignalId;
  else delete owner.dataset.sourceSignalId;
  if (primitive.traceOffsetCycles !== undefined) owner.dataset.traceOffsetCycles = String(primitive.traceOffsetCycles);
  else delete owner.dataset.traceOffsetCycles;
  owner.dataset.locked = String(primitive.locked ?? false);
  owner.setAttribute("aria-label", `${primitive.type}: ${primitive.label}${primitive.locked ? " (locked)" : ""}`);
}

export function renderOverlay(owner: HTMLElement, primitive: AnnotationOverlayPrimitive): void {
  syncOverlayIdentity(owner, primitive);
  owner.hidden = !primitive.visible;
  owner.style.setProperty("--annotation-color", primitive.color ?? "#d04a36");
  owner.style.height = `${primitive.surfaceHeight}px`;
  const document = owner.ownerDocument;
  const body = document.createElement("span");
  body.dataset.role = "annotation-body";
  const first = primitive.anchors[0] ?? { field: "anchor" as const, x: 0, y: 0 };
  const second = primitive.anchors[1] ?? first;
  const dx = second.x - first.x;
  const dy = second.y - first.y;

  // #418: a Measurement's dimension line/label is placed 18px-per-lane
  // *above* its anchors by default -- but when the topmost anchor is on
  // (or near) the first row, that pushes the line/label above local
  // y=RULER_SAFE_AREA_HEIGHT, into the surface-host's own reserved top
  // padding (center-columns.css's `.surface-host { padding-top: 34px }`,
  // matching `.cycle-ruler`'s own 34px height) -- the sticky Cycle Ruler
  // occupies exactly that band at the top of the scrollable content, at
  // any scroll position, so anything placed above it there is hidden
  // behind/under the Ruler. Flip to placing the dimension line *below*
  // the anchors instead whenever the "above" placement would intrude on
  // that reserved band, so a Measurement starting on the top-row Signal
  // stays fully inside the visible canvas. `measurementPlacedBelow` also
  // drives the label's default offset direction below.
  const RULER_SAFE_AREA_HEIGHT = 34;
  const measurementLaneOffset = primitive.type === "measurement" && primitive.measurementLane !== undefined ? 18 * (primitive.measurementLane + 1) : undefined;
  const measurementPlacedBelow = measurementLaneOffset !== undefined && Math.min(first.y, second.y) - measurementLaneOffset < RULER_SAFE_AREA_HEIGHT;
  const dimensionY = measurementLaneOffset === undefined
    ? undefined
    : measurementPlacedBelow ? Math.max(first.y, second.y) + measurementLaneOffset : Math.min(first.y, second.y) - measurementLaneOffset;
  if (measurementLaneOffset !== undefined) owner.dataset.measurementSide = measurementPlacedBelow ? "below" : "above";
  else delete owner.dataset.measurementSide;
  const lineFirst = dimensionY === undefined ? first : { x: first.x, y: dimensionY };
  const lineSecond = dimensionY === undefined ? second : { x: second.x, y: dimensionY };
  // Additive on top of any anchor-derived angle below -- never replaces it,
  // so line-shaped overlays keep auto-orienting from their two anchors and
  // this only rotates further on top of that.
  const rotationDeg = primitive.rotation ?? 0;
  const rotateSuffix = rotationDeg === 0 ? "" : ` rotate(${rotationDeg}deg)`;
  if (primitive.shape === "point") {
    body.style.transform = `translate(${first.x}px, ${first.y}px)${rotateSuffix}`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "vertical") {
    body.style.transform = `translateX(${first.x}px)${rotateSuffix}`;
    body.style.height = `${primitive.surfaceHeight}px`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "range") {
    body.style.transform = `translate(${Math.min(first.x, second.x)}px, 0px)${rotateSuffix}`;
    body.style.width = `${Math.max(2, Math.abs(dx))}px`;
    body.style.height = `${primitive.surfaceHeight}px`;
    body.dataset.annotationField = first.field;
  } else if (primitive.shape === "trace") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.role = "ghost-trace";
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(primitive.surfaceHeight));
    svg.setAttribute("aria-hidden", "true");
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.dataset.role = "ghost-trace-path";
    polyline.setAttribute("points", (primitive.tracePoints ?? []).map((point) => `${point.x},${point.y}`).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", primitive.color ?? "#64748b");
    polyline.setAttribute("stroke-width", "2");
    polyline.setAttribute("stroke-dasharray", "6 4");
    polyline.setAttribute("opacity", String(primitive.opacity ?? 0.55));
    svg.append(polyline);
    body.append(svg);
    if (rotationDeg !== 0) body.style.transform = `rotate(${rotationDeg}deg)`;
    body.dataset.annotationField = first.field;
  } else {
    renderLineBody(body, primitive, lineFirst, lineSecond, rotationDeg);
    body.dataset.annotationField = first.field;
  }
  if (primitive.type === "marker" && primitive.verticalExtent) {
    body.style.height = `${Math.max(2, primitive.verticalExtent.bottom - primitive.verticalExtent.top)}px`;
    body.style.transform = `translate(${first.x}px, ${primitive.verticalExtent.top}px)${rotateSuffix}`;
  }
  // #378: independent Stroke width/style and Fill color/opacity, applied as
  // inline style overrides on top of the shape's existing CSS defaults (see
  // center-columns.css's [data-annotation-type=...] [data-role="annotation-
  // body"] rules) -- an absent value here leaves that CSS default in place,
  // so a document with no Stroke/Fill authored looks exactly as before.
  const presentation = parsePresentationStyle(primitive.style);
  if (presentation.strokeWidth !== undefined) body.style.borderWidth = `${presentation.strokeWidth}px`; else body.style.removeProperty("border-width");
  if (presentation.strokeStyle !== undefined) body.style.borderStyle = presentation.strokeStyle; else body.style.removeProperty("border-style");
  if (presentation.fillColor !== undefined || presentation.fillOpacity !== undefined) {
    const base = presentation.fillColor === "none" ? undefined : presentation.fillColor ?? primitive.color ?? "#d04a36";
    body.style.backgroundColor = base === undefined ? "transparent" : `color-mix(in srgb, ${base} ${Math.round((presentation.fillOpacity ?? 0.12) * 100)}%, transparent)`;
  } else body.style.removeProperty("background-color");
  const label = document.createElement("span");
  label.dataset.role = "annotation-label";
  label.dataset.annotationLabel = "true";
  const labelPresentation = parsePresentationStyle(primitive.style);
  const textStyle = parseTextStyle(primitive.style);
  label.textContent = labelPresentation.labelWrap === false ? primitive.label : wrapAnnotationLabel(primitive.label, labelPresentation.labelMaxWidth ?? ANNOTATION_LABEL_MAX_WIDTH.default, textStyle.fontSize);
  // Authored label layout remains presentation-only but follows the same
  // persisted style consumed by ExportScene. Missing fields retain the
  // historical 180px wrap behavior.
  label.style.whiteSpace = "pre";
  label.style.maxWidth = "none";
  applyTextStyle(label, textStyle);
  if (primitive.align) label.style.textAlign = primitive.align; else label.style.removeProperty("text-align");
  const labelMidpoint = { x: (lineFirst.x + lineSecond.x) / 2, y: (lineFirst.y + lineSecond.y) / 2 };
  const labelAnchor = primitive.labelPlacement === "start" ? first
    : primitive.labelPlacement === "end" ? second
    : labelMidpoint;
  const labelBaseY = primitive.labelPlacement === "above" ? labelMidpoint.y - 14
    : primitive.labelPlacement === "below" ? labelMidpoint.y + 14
    : labelAnchor.y;
  label.style.transform = `translate(${labelAnchor.x + (primitive.labelOffset?.x ?? 0)}px, ${labelBaseY + (primitive.labelOffset?.y ?? (measurementPlacedBelow ? 14 : -14))}px)`;
  // #378: a real (SVG, not Unicode) lock glyph -- `label` is already
  // `position: absolute` (center-columns.css), which makes it a containing
  // block for this glyph's own `position: absolute`, so it rides along with
  // the label's translate() with no extra positioning math needed here.
  if (primitive.locked) {
    const svgNs = "http://www.w3.org/2000/svg";
    const lock = document.createElementNS(svgNs, "svg");
    lock.dataset.role = "annotation-lock-glyph";
    lock.setAttribute("viewBox", "0 0 10 10");
    lock.setAttribute("aria-hidden", "true");
    lock.style.position = "absolute";
    lock.style.left = "-14px";
    lock.style.top = "2px";
    lock.style.width = "10px";
    lock.style.height = "10px";
    lock.style.color = "#334155";
    const shackle = document.createElementNS(svgNs, "path");
    shackle.setAttribute("d", "M 2.5 4 V 2.5 A 2.5 2.5 0 0 1 7.5 2.5 V 4");
    shackle.setAttribute("fill", "none");
    shackle.setAttribute("stroke", "currentColor");
    shackle.setAttribute("stroke-width", "1.2");
    const body2 = document.createElementNS(svgNs, "rect");
    body2.setAttribute("x", "1.5"); body2.setAttribute("y", "4"); body2.setAttribute("width", "7"); body2.setAttribute("height", "5.5"); body2.setAttribute("rx", "1");
    body2.setAttribute("fill", "currentColor");
    lock.append(shackle, body2);
    label.append(lock);
  }
  const dimensionParts: HTMLElement[] = [];
  if (primitive.type === "measurement" && primitive.measurementLayout && dimensionY !== undefined) {
    const layout = primitive.measurementLayout;
    const addMarker = (anchor: typeof first, side: "start" | "end", kind: "none" | "bar" | "arrow") => {
      if (kind === "none") return;
      const marker = document.createElement("span");
      marker.dataset.role = "measurement-marker";
      marker.dataset.markerSide = side;
      marker.dataset.markerKind = kind;
      marker.dataset.arrowLayout = layout.arrowLayout;
      marker.style.transform = `translate(${anchor.x}px, ${dimensionY}px)`;
      dimensionParts.push(marker);
    };
    const addExtension = (anchor: typeof first, side: "start" | "end") => {
      if (!(layout.extensionLines === "both" || layout.extensionLines === side)) return;
      const extension = document.createElement("span");
      extension.dataset.role = "measurement-extension";
      extension.dataset.extensionSide = side;
      extension.style.height = `${Math.abs(dimensionY - anchor.y)}px`;
      extension.style.transform = `translate(${anchor.x}px, ${Math.min(anchor.y, dimensionY)}px)`;
      dimensionParts.push(extension);
    };
    addMarker(first, "start", layout.startMarker);
    addMarker(second, "end", layout.endMarker);
    addExtension(first, "start");
    addExtension(second, "end");
  }
  const handles = primitive.anchors.map((anchor) => {
    const handle = document.createElement("span");
    handle.dataset.role = "annotation-handle";
    handle.dataset.annotationField = anchor.field;
    if (anchor.threshold !== undefined) handle.dataset.anchorThreshold = String(anchor.threshold);
    if (anchor.transitionKind !== undefined) handle.dataset.anchorTransitionKind = anchor.transitionKind;
    handle.style.transform = `translate(${anchor.x}px, ${anchor.y}px)`;
    return handle;
  });
  owner.replaceChildren(body, label, ...dimensionParts, ...handles);
}

type LinePoint = Readonly<{ x: number; y: number }>;

function svgFragmentId(id: string): string {
  // Stable IDs are opaque. Encode every code point rather than assuming an
  // identifier grammar or allowing two different IDs to sanitize alike.
  return Array.from(id, (character) => (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0")).join("_");
}

function linePath(lineType: NonNullable<AnnotationOverlayPrimitive["lineType"]>, first: LinePoint, second: LinePoint): { readonly d: string; readonly points: readonly LinePoint[]; readonly dash?: string } {
  if (lineType === "orthogonal") {
    const bendX = (first.x + second.x) / 2;
    const bends = [{ x: bendX, y: first.y }, { x: bendX, y: second.y }];
    const firstBend = bends[0]!;
    const secondBend = bends[1]!;
    return { d: `M ${first.x} ${first.y} L ${firstBend.x} ${firstBend.y} L ${secondBend.x} ${secondBend.y} L ${second.x} ${second.y}`, points: [first, firstBend, secondBend, second] };
  }
  if (lineType === "curve") {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.max(14, length * 0.24);
    const normal = { x: -dy / length * offset, y: dx / length * offset };
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const control = { x: midpoint.x + normal.x, y: midpoint.y + normal.y };
    return { d: `M ${first.x} ${first.y} Q ${control.x} ${control.y} ${second.x} ${second.y}`, points: [first, control, second] };
  }
  if (lineType === "diagonal") {
    // #375: Diagonal must have genuinely distinct path geometry from
    // Straight, not merely a different stroke pattern on an identical
    // path -- a route bent through a single 45-degree elbow (unlike
    // Orthogonal's axis-aligned 90-degree bend, and unlike Straight's
    // single direct segment at whatever angle the two anchors happen to
    // form). Runs diagonally for min(|dx|, |dy|), then finishes straight
    // along whichever axis has the remaining distance.
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const run = Math.min(Math.abs(dx), Math.abs(dy));
    const bend = { x: first.x + Math.sign(dx || 1) * run, y: first.y + Math.sign(dy || 1) * run };
    return { d: `M ${first.x} ${first.y} L ${bend.x} ${bend.y} L ${second.x} ${second.y}`, points: [first, bend, second], dash: "7 4" };
  }
  // Straight is a direct single segment between the two anchors.
  return { d: `M ${first.x} ${first.y} L ${second.x} ${second.y}`, points: [first, second] };
}

function renderLineBody(body: HTMLElement, primitive: AnnotationOverlayPrimitive, first: LinePoint, second: LinePoint, rotationDeg: number): void {
  const lineType = primitive.lineType ?? "straight";
  const path = linePath(lineType, first, second);
  const padding = 10;
  const minX = Math.min(...path.points.map((point) => point.x)) - padding;
  const minY = Math.min(...path.points.map((point) => point.y)) - padding;
  const width = Math.max(20, Math.max(...path.points.map((point) => point.x)) - minX + padding);
  const height = Math.max(20, Math.max(...path.points.map((point) => point.y)) - minY + padding);
  const toLocal = (point: LinePoint): LinePoint => ({ x: point.x - minX, y: point.y - minY });
  const localFirst = toLocal(first);
  const localSecond = toLocal(second);
  const localPoints = path.points.map(toLocal);
  const localPath = lineType === "orthogonal"
    ? `M ${localPoints[0]!.x} ${localPoints[0]!.y} L ${localPoints[1]!.x} ${localPoints[1]!.y} L ${localPoints[2]!.x} ${localPoints[2]!.y} L ${localPoints[3]!.x} ${localPoints[3]!.y}`
    : lineType === "curve"
      ? `M ${localFirst.x} ${localFirst.y} Q ${localPoints[1]!.x} ${localPoints[1]!.y} ${localSecond.x} ${localSecond.y}`
      // #375: Diagonal's 45-degree elbow (see linePath above) is a 3-point,
      // 2-segment path -- localPoints[1] is the bend point.
      : lineType === "diagonal"
        ? `M ${localFirst.x} ${localFirst.y} L ${localPoints[1]!.x} ${localPoints[1]!.y} L ${localSecond.x} ${localSecond.y}`
        : `M ${localFirst.x} ${localFirst.y} L ${localSecond.x} ${localSecond.y}`;
  const svgDocument = body.ownerDocument;
  const svg = svgDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  const pathElement = svgDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  const defs = svgDocument.createElementNS("http://www.w3.org/2000/svg", "defs");
  const markerId = `annotation-arrow-${svgFragmentId(primitive.id)}`;
  const marker = (suffix: string, reverse: boolean) => {
    const result = svgDocument.createElementNS("http://www.w3.org/2000/svg", "marker");
    result.setAttribute("id", `${markerId}-${suffix}`);
    result.setAttribute("markerWidth", "8");
    result.setAttribute("markerHeight", "8");
    result.setAttribute("refX", reverse ? "1" : "7");
    result.setAttribute("refY", "4");
    result.setAttribute("orient", "auto-start-reverse");
    result.setAttribute("markerUnits", "strokeWidth");
    const head = svgDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    head.setAttribute("d", reverse ? "M 8 0 L 0 4 L 8 8 Z" : "M 0 0 L 8 4 L 0 8 Z");
    head.setAttribute("fill", primitive.color ?? "#d04a36");
    result.append(head);
    return result;
  };
  const arrowhead = primitive.arrowhead ?? "none";
  if (arrowhead === "start" || arrowhead === "bidirectional") defs.append(marker("start", true));
  if (arrowhead === "end" || arrowhead === "bidirectional") defs.append(marker("end", false));
  svg.append(defs);
  svg.dataset.role = "annotation-line";
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  pathElement.dataset.role = "annotation-path";
  pathElement.dataset.lineType = lineType;
  pathElement.setAttribute("d", localPath);
  pathElement.setAttribute("fill", "none");
  pathElement.setAttribute("stroke", primitive.color ?? "#d04a36");
  pathElement.setAttribute("stroke-width", "2");
  pathElement.setAttribute("stroke-linecap", "round");
  pathElement.setAttribute("stroke-linejoin", "round");
  if (path.dash) pathElement.setAttribute("stroke-dasharray", path.dash);
  if (arrowhead === "start" || arrowhead === "bidirectional") pathElement.setAttribute("marker-start", `url(#${markerId}-start)`);
  if (arrowhead === "end" || arrowhead === "bidirectional") pathElement.setAttribute("marker-end", `url(#${markerId}-end)`);
  if (rotationDeg !== 0) pathElement.setAttribute("transform", `rotate(${rotationDeg} ${(localFirst.x + localSecond.x) / 2} ${(localFirst.y + localSecond.y) / 2})`);
  svg.append(pathElement);
  if (primitive.type === "bracket") {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const capX = -dy / length * 6;
    const capY = dx / length * 6;
    const caps = svgDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    caps.dataset.role = "annotation-bracket-caps";
    caps.setAttribute("d", `M ${localFirst.x - capX} ${localFirst.y - capY} L ${localFirst.x + capX} ${localFirst.y + capY} M ${localSecond.x - capX} ${localSecond.y - capY} L ${localSecond.x + capX} ${localSecond.y + capY}`);
    caps.setAttribute("fill", "none");
    caps.setAttribute("stroke", primitive.color ?? "#d04a36");
    caps.setAttribute("stroke-width", "2");
    caps.setAttribute("stroke-linecap", "round");
    if (rotationDeg !== 0) caps.setAttribute("transform", `rotate(${rotationDeg} ${(localFirst.x + localSecond.x) / 2} ${(localFirst.y + localSecond.y) / 2})`);
    svg.append(caps);
  }
  body.dataset.lineRenderer = "svg";
  body.dataset.orthogonalDirection = `${second.x - first.x < 0 ? "left" : "right"}-${second.y - first.y < 0 ? "up" : "down"}`;
  body.style.transform = `translate(${minX}px, ${minY}px)`;
  body.style.width = `${width}px`;
  body.style.height = `${height}px`;
  body.replaceChildren(svg);
}


/** #378: Stroke (independent width/style) and Fill (independent color/
 * opacity) for the CSS-border/background-driven Annotation shapes (see
 * apps/editor/src/annotation-capability-matrix.ts's STROKE_CAPABLE/
 * FILL_CAPABLE for exactly which types). Same permissive-parse-from-a-
 * free-form-JsonObject convention as parseTextStyle below -- an absent or
 * malformed value here means "use the shape's existing CSS default",
 * never a thrown error or a garbage inline style. */
function parsePresentationStyle(style: Record<string, unknown> | undefined): { readonly strokeWidth?: number | undefined; readonly strokeStyle?: "solid" | "dashed" | "dotted" | undefined; readonly fillColor?: string | undefined; readonly fillOpacity?: number | undefined; readonly labelWrap?: boolean | undefined; readonly labelMaxWidth?: number | undefined } {
  const source = style ?? {};
  return {
    strokeWidth: typeof source.strokeWidth === "number" && source.strokeWidth >= 1 && source.strokeWidth <= 8 ? source.strokeWidth : undefined,
    strokeStyle: source.strokeStyle === "solid" || source.strokeStyle === "dashed" || source.strokeStyle === "dotted" ? source.strokeStyle : undefined,
    fillColor: typeof source.fillColor === "string" && (source.fillColor === "none" || /^#[0-9a-f]{3,8}$/i.test(source.fillColor)) ? source.fillColor : undefined,
    fillOpacity: typeof source.fillOpacity === "number" && source.fillOpacity >= 0 && source.fillOpacity <= 1 ? source.fillOpacity : undefined,
    labelWrap: typeof source.labelWrap === "boolean" ? source.labelWrap : undefined,
    labelMaxWidth: typeof source.labelMaxWidth === "number" && source.labelMaxWidth >= ANNOTATION_LABEL_MAX_WIDTH.min && source.labelMaxWidth <= ANNOTATION_LABEL_MAX_WIDTH.max ? source.labelMaxWidth : undefined,
  };
}

export function parseTextStyle(style: Record<string, unknown> | undefined): { readonly color?: string | undefined; readonly background?: string | undefined; readonly fontWeight?: string | undefined; readonly fontStyle?: string | undefined; readonly fontFamily?: string | undefined; readonly fontSize?: number | undefined; readonly textDecoration?: string | undefined; readonly lineHeight?: number | undefined } {
  const source = style ?? {};
  return {
    color: typeof source.color === "string" && /^#[0-9a-f]{3,8}$/i.test(source.color) ? source.color : undefined,
    background: typeof source.background === "string" && /^#[0-9a-f]{3,8}$/i.test(source.background) ? source.background : undefined,
    fontWeight: typeof source.fontWeight === "string" && /^(normal|bold|[1-9]00)$/.test(source.fontWeight) ? source.fontWeight : undefined,
    fontStyle: source.fontStyle === "italic" || source.fontStyle === "normal" ? source.fontStyle : undefined,
    fontFamily: typeof source.fontFamily === "string" && source.fontFamily.length <= 120 ? source.fontFamily : undefined,
    fontSize: typeof source.fontSize === "number" && source.fontSize >= 6 && source.fontSize <= 48 ? source.fontSize : undefined,
    textDecoration: typeof source.textDecoration === "string" && /^(|underline|line-through|underline line-through)$/.test(source.textDecoration) ? source.textDecoration : undefined,
    lineHeight: typeof source.lineHeight === "number" && source.lineHeight >= ANNOTATION_LABEL_LINE_HEIGHT.min && source.lineHeight <= ANNOTATION_LABEL_LINE_HEIGHT.max ? source.lineHeight : undefined,
  };
}

/** Applies a parsed text style to an element's inline style + the
 * color-tracking dataset attribute already used by signal-row shells. */
export function applyTextStyle(element: HTMLElement, parsed: ReturnType<typeof parseTextStyle>): void {
  if (parsed.color) { element.style.color = parsed.color; element.dataset.signalStyleColor = parsed.color; } else { element.style.removeProperty("color"); delete element.dataset.signalStyleColor; }
  if (parsed.background) element.style.backgroundColor = parsed.background; else element.style.removeProperty("background-color");
  if (parsed.fontWeight) element.style.fontWeight = parsed.fontWeight; else element.style.removeProperty("font-weight");
  if (parsed.fontStyle) element.style.fontStyle = parsed.fontStyle; else element.style.removeProperty("font-style");
  if (parsed.fontFamily) element.style.fontFamily = parsed.fontFamily; else element.style.removeProperty("font-family");
  if (parsed.fontSize) element.style.fontSize = `${parsed.fontSize}px`; else element.style.removeProperty("font-size");
  if (parsed.textDecoration !== undefined) element.style.textDecoration = parsed.textDecoration; else element.style.removeProperty("text-decoration");
  if (parsed.lineHeight) element.style.lineHeight = String(parsed.lineHeight); else element.style.removeProperty("line-height");
}

