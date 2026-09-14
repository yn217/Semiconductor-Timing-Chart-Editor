import { ImmutableLocalGeometryMap, type LocalGeometryEntry, type Point, type TransitionGeometryResolver } from "@timing-chart-v2/geometry";
import type { AnchorPoint } from "@timing-chart-v2/schema";
import { WaveDromAdapterError, type GeometryExtractionMetrics, type RenderedWave } from "./types.js";

interface MatrixLike { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }
interface Segment { readonly start: Point; readonly end: Point; readonly control1?: Point; readonly control2?: Point }

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const pathTokens = (path: string): string[] => path.match(/[A-Za-z]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi) ?? [];
const point = (x: number, y: number): Point => ({ x, y });
const transformPoint = (matrix: MatrixLike, value: Point): Point => ({ x: matrix.a * value.x + matrix.c * value.y + matrix.e, y: matrix.b * value.x + matrix.d * value.y + matrix.f });

function parsePrimaryStroke(path: string): Segment[] {
  const tokens = pathTokens(path);
  const segments: Segment[] = [];
  let index = 0;
  let command = "";
  let current = point(0, 0);
  let subpath = current;
  const read = (): number => {
    const token = tokens[index];
    if (!token || !numberPattern.test(token)) throw new WaveDromAdapterError("INVALID_SKIN_PATH", `Cannot parse WaveDrom skin path '${path}'.`);
    index += 1;
    return Number(token);
  };
  const relative = (x: number, y: number, isRelative: boolean): Point => isRelative ? point(current.x + x, current.y + y) : point(x, y);

  while (index < tokens.length) {
    const token = tokens[index];
    if (token && /^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
      if (command === "z" || command === "Z") { current = subpath; continue; }
    }
    const lower = command.toLowerCase();
    const isRelative = command === lower;
    if (lower === "m") {
      const next = relative(read(), read(), isRelative);
      current = next;
      subpath = next;
      command = isRelative ? "l" : "L";
    } else if (lower === "l") {
      const next = relative(read(), read(), isRelative);
      segments.push({ start: current, end: next });
      current = next;
    } else if (lower === "c") {
      const start = current;
      const control1 = relative(read(), read(), isRelative);
      const control2 = relative(read(), read(), isRelative);
      const end = relative(read(), read(), isRelative);
      segments.push({ start, control1, control2, end });
      current = end;
    } else {
      throw new WaveDromAdapterError("UNSUPPORTED_SKIN_PATH", `WaveDrom skin path command '${command}' is not supported by the extractor.`);
    }
  }
  return segments;
}

function transitionSegments(svg: SVGElement, brickId: string, cache: Map<string, readonly Segment[]>, metrics?: { transitionBrickLookups: number; skinPathParses: number }): readonly Segment[] {
  const cached = cache.get(brickId);
  if (cached) return cached;
  if (metrics) metrics.transitionBrickLookups += 1;
  const brick = Array.from(svg.querySelectorAll<SVGGElement>("defs g[id]")).find((item) => item.id === brickId);
  if (!brick) throw new WaveDromAdapterError("MISSING_WAVEDROM_BRICK", `Rendered SVG does not contain brick '${brickId}'.`);
  const segments: Segment[] = [];
  for (const path of Array.from(brick.querySelectorAll<SVGPathElement>("path.s1"))) {
    const d = path.getAttribute("d");
    if (!d) continue;
    if (metrics) metrics.skinPathParses += 1;
    for (const segment of parsePrimaryStroke(d)) {
      const ys = [segment.start.y, segment.control1?.y, segment.control2?.y, segment.end.y].filter((value): value is number => value !== undefined);
      if (Math.max(...ys) === Math.min(...ys)) continue;
      segments.push(segment);
    }
  }
  const result = Object.freeze(segments.slice());
  cache.set(brickId, result);
  return result;
}

function groupById<T extends Element>(svg: SVGElement, id: string): T {
  const element = Array.from(svg.querySelectorAll<T>("[id]")).find((item) => item.id === id);
  if (!element) throw new WaveDromAdapterError("INVALID_WAVEDROM_STRUCTURE", `Rendered SVG is missing '${id}'.`);
  return element;
}

function multiply(left: MatrixLike, right: MatrixLike): MatrixLike {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function inverse(matrix: MatrixLike): MatrixLike {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (!Number.isFinite(determinant) || determinant === 0) throw new WaveDromAdapterError("INVALID_WAVEDROM_MATRIX", "WaveDrom SVG exposed a non-invertible transform.");
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

function matrixOf(svg: SVGGraphicsElement, group: SVGGElement): MatrixLike {
  const rootMatrix = svg.getScreenCTM();
  const groupMatrix = group.getScreenCTM();
  if (!rootMatrix || !groupMatrix) throw new WaveDromAdapterError("DETACHED_WAVEDROM_SVG", "WaveDrom SVG must be mounted before Local Geometry extraction.");
  // Express the group transform in the SVG root's user coordinates. This keeps
  // Local Geometry independent from the responsive Screen Geometry viewport.
  return multiply(inverse(rootMatrix), groupMatrix);
}

function useTranslation(element: SVGUseElement): Point {
  const transform = element.getAttribute("transform");
  if (!transform) return point(0, 0);
  const match = /^translate\(\s*([+-]?[\d.]+)(?:[ ,]+([+-]?[\d.]+))?\s*\)$/.exec(transform);
  if (!match) throw new WaveDromAdapterError("UNSUPPORTED_USE_TRANSFORM", `Unsupported WaveDrom use transform '${transform}'.`);
  return point(Number(match[1]), Number(match[2] ?? 0));
}

function hrefOf(element: SVGUseElement): string {
  const href = element.getAttribute("href") ?? element.getAttribute("xlink:href");
  if (!href?.startsWith("#")) throw new WaveDromAdapterError("INVALID_WAVEDROM_USE", "WaveDrom brick use has no local href.");
  return href.slice(1);
}

function geometryEntryKey(cycle: number, anchorPoint: AnchorPoint, threshold?: number): string {
  return `${cycle}:${anchorPoint}:${threshold ?? ""}`;
}

function clockLevel(token: string, initial: 0 | 1): readonly [0 | 1, 0 | 1] {
  if (token === "." || token === "|") return [initial, initial];
  if (token === "p") return [1, 0];
  if (token === "n") return [0, 1];
  if (token === "0" || token === "1") return [Number(token) as 0 | 1, Number(token) as 0 | 1];
  return [initial, initial];
}

export interface GeometryEntryAccumulator {
  add(cycle: number, anchorPoint: AnchorPoint, position: Point, threshold?: number): void;
  entries(): readonly LocalGeometryEntry[];
  metrics(): Pick<GeometryExtractionMetrics, "geometryEntriesEmitted" | "duplicateKeyChecks" | "duplicateKeyCollisions">;
}

/**
 * Collect geometry entries by their semantic identity.  A Set keeps duplicate
 * detection independent of the number of anchors already collected while the
 * array preserves the extractor's existing first-write ordering/position
 * semantics.
 */
export function createGeometryEntryAccumulator(): GeometryEntryAccumulator {
  const entries: LocalGeometryEntry[] = [];
  const seen = new Set<string>();
  let duplicateKeyChecks = 0;
  let duplicateKeyCollisions = 0;
  return {
    add: (cycle, anchorPoint, position, threshold) => {
      duplicateKeyChecks += 1;
      const key = geometryEntryKey(cycle, anchorPoint, threshold);
      if (seen.has(key)) {
        duplicateKeyCollisions += 1;
        return;
      }
      seen.add(key);
      entries.push({ cycle, point: anchorPoint, ...(threshold === undefined ? {} : { threshold }), position });
    },
    entries: () => entries,
    metrics: () => ({ geometryEntriesEmitted: entries.length, duplicateKeyChecks, duplicateKeyCollisions }),
  };
}

function interpolateSegment(segment: Segment, fraction: number): Point {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (segment.control1 && segment.control2) {
    const inverse = 1 - clamped;
    return point(
      inverse ** 3 * segment.start.x + 3 * inverse ** 2 * clamped * segment.control1.x + 3 * inverse * clamped ** 2 * segment.control2.x + clamped ** 3 * segment.end.x,
      inverse ** 3 * segment.start.y + 3 * inverse ** 2 * clamped * segment.control1.y + 3 * inverse * clamped ** 2 * segment.control2.y + clamped ** 3 * segment.end.y,
    );
  }
  return point(segment.start.x + (segment.end.x - segment.start.x) * clamped, segment.start.y + (segment.end.y - segment.start.y) * clamped);
}

export function extractLocalGeometry(rendered: RenderedWave, metrics?: { -readonly [K in keyof GeometryExtractionMetrics]: GeometryExtractionMetrics[K] }): ImmutableLocalGeometryMap {
  const startedAt = globalThis.performance?.now() ?? Date.now();
  const { svg, renderIndex, waveJson } = rendered;
  const sourceStart = waveJson.geometryWindow?.start ?? waveJson.sourceWindow?.start ?? 0;
  const lanes = groupById<SVGGElement>(svg, `lanes_${renderIndex}`);
  const draw = groupById<SVGGElement>(svg, `wavelane_draw_0_${renderIndex}`);
  const laneMatrix = matrixOf(svg as SVGGraphicsElement, lanes);
  const drawMatrix = matrixOf(svg as SVGGraphicsElement, draw);
  const gridLines = Array.from(lanes.querySelectorAll<SVGLineElement>(`[id^="gmark_"]`))
    .map((line) => ({ x: Number(line.getAttribute("x1")), y1: Number(line.getAttribute("y1")), y2: Number(line.getAttribute("y2")) }))
    .filter((line) => [line.x, line.y1, line.y2].every(Number.isFinite))
    .sort((left, right) => left.x - right.x);
  if (gridLines.length < 2) throw new WaveDromAdapterError("MISSING_CYCLE_GRID", "WaveDrom SVG does not expose at least one complete cycle.");

  const renderedBoundaries = gridLines.map((line) => transformPoint(laneMatrix, point(line.x, (line.y1 + line.y2) / 2)));
  // WaveDrom's gmark elements are presentation marks and may be thinned;
  // they are not the semantic cycle-boundary index.  A bounded window still
  // has a complete time domain, so recover its semantic boundaries from the
  // actual rendered domain endpoints and the window length.  This keeps the
  // expansion bounded by the current source window rather than the canonical
  // document length.
  const sourceWindowLength = waveJson.geometrySourceCycles !== undefined ? waveJson.geometrySourceCycles.length - 1 : waveJson.geometryWindow === undefined ? (waveJson.sourceWindow === undefined ? undefined : waveJson.sourceWindow.end - waveJson.sourceWindow.start) : waveJson.geometryWindow.end - waveJson.geometryWindow.start;
  const boundaries = waveJson.geometrySourceCycles !== undefined ? renderedBoundaries : sourceWindowLength !== undefined && renderedBoundaries.length >= 2 && renderedBoundaries.length !== sourceWindowLength + 1
    ? Array.from({ length: sourceWindowLength + 1 }, (_, index) => {
      const first = renderedBoundaries[0]!;
      const last = renderedBoundaries[renderedBoundaries.length - 1]!;
      const fraction = index / sourceWindowLength;
      return point(first.x + (last.x - first.x) * fraction, first.y + (last.y - first.y) * fraction);
    })
    : renderedBoundaries;
  // Every local/display boundary emitted by WaveDrom must use the same
  // source-domain identity.  With folds, local cycle N is not necessarily
  // sourceStart + N; geometrySourceCycles is the shared mapping's authoritative
  // boundary index.  Keep arithmetic only as the identity/no-fold fallback.
  const sourceCycleAt = (localBoundary: number): number => waveJson.geometrySourceCycles?.[localBoundary] ?? localBoundary + sourceStart;
  const accumulator = createGeometryEntryAccumulator();
  const transitionResolvers: TransitionGeometryResolver[] = [];
  const add = accumulator.add;
  for (let cycle = 0; cycle < boundaries.length - 1; cycle += 1) {
    const start = boundaries[cycle];
    const end = boundaries[cycle + 1];
    if (!start || !end) continue;
    const sourceCycle = sourceCycleAt(cycle);
    add(sourceCycle, "cycle-start", start);
    add(sourceCycle, "cycle-center", point((start.x + end.x) / 2, (start.y + end.y) / 2));
    add(sourceCycle, "value-center", point((start.x + end.x) / 2, (start.y + end.y) / 2));
    add(sourceCycle, "row-center", point((start.x + end.x) / 2, (start.y + end.y) / 2));
    add(sourceCycle, "cycle-end", end);
  }
  // The terminal timeline boundary (cycle == cycleCount, i.e. the half-open range's exclusive end)
  // has no per-cycle slot of its own - it's only ever the "cycle-end" of the last cycle. Store it as
  // a resolvable "cycle-start" at that boundary index too, so callers (Ruler final tick, a Transaction
  // or TimeGroup ending exactly at cycleCount) can resolve it directly instead of extrapolating.
  const terminalCycle = boundaries.length - 1;
  const terminalBoundary = boundaries[terminalCycle];
  if (terminalBoundary) add(sourceCycleAt(terminalCycle), "cycle-start", terminalBoundary);

  const phaseHalfBricks = (waveJson.phase ?? 0) * 2;
  if (!Number.isInteger(phaseHalfBricks)) throw new WaveDromAdapterError("UNSUPPORTED_GEOMETRY_PHASE", "Geometry extraction requires half-cycle-aligned WaveDrom phase.");
  const clippedHalfBricks = Math.max(0, phaseHalfBricks);
  const uses = Array.from(draw.querySelectorAll<SVGUseElement>("use"));
  if (metrics) {
    metrics.usesVisited += uses.length;
    metrics.matrixReads += 2;
  }
  const usesByClockSlot = waveJson.clock?.expanded
    ? uses.reduce((index, use, visibleIndex) => {
      const slot = Math.floor((visibleIndex + clippedHalfBricks) / 2);
      const slotUses = index.get(slot);
      if (slotUses) slotUses.push(use);
      else index.set(slot, [use]);
      return index;
    }, new Map<number, SVGUseElement[]>())
    : undefined;
  const rowY = boundaries[0]?.y ?? 0;
  const transitionCache = new Map<string, readonly Segment[]>();

  for (let visibleIndex = 0; visibleIndex < uses.length; visibleIndex += 1) {
    const use = uses[visibleIndex];
    if (!use) continue;
    const originalHalfBrick = visibleIndex + clippedHalfBricks;
    const localCycle = Math.floor(originalHalfBrick / 2);
    if (localCycle < 0 || localCycle >= boundaries.length - 1) continue;
    const sourceCycle = sourceCycleAt(localCycle);
    const href = hrefOf(use);
    const translated = useTranslation(use);
    const origin = transformPoint(drawMatrix, translated);
    if (!waveJson.clock?.expanded) {
      if (href === "pclk" || href === "Pclk") add(sourceCycle, "rising-edge", point(origin.x, rowY));
      if (href === "nclk" || href === "Nclk") add(sourceCycle, "falling-edge", point(origin.x, rowY));
    }
  }

  if (waveJson.clock?.expanded) {
    let previousLevel: 0 | 1 = waveJson.clock.initial;
    for (let slot = 0; slot < waveJson.wave.length; slot += 1) {
      const token = waveJson.wave[slot] ?? ".";
      const [startLevel, endLevel] = clockLevel(token, previousLevel);
      const boundary = boundaries[slot];
      if (!boundary) continue;
      const sourceCycle = sourceCycleAt(slot);
      if (startLevel !== previousLevel) add(sourceCycle, startLevel === 1 ? "rising-edge" : "falling-edge", boundary);
      if (startLevel !== endLevel) {
        const slotUses = usesByClockSlot?.get(slot) ?? [];
        const targetHref = startLevel === 1 ? "pclk" : "nclk";
        const edgeUse = slotUses.find((use) => hrefOf(use) === targetHref);
        if (edgeUse) {
          const translated = useTranslation(edgeUse);
          const edgePoint = transformPoint(drawMatrix, translated);
          add(sourceCycle, startLevel === 1 ? "rising-edge" : "falling-edge", point(edgePoint.x, rowY));
        }
        const endHref = endLevel === 1 ? "pclk" : "nclk";
        const endUse = slotUses.find((use) => hrefOf(use) === endHref && use !== edgeUse);
        if (endUse) {
          const translated = useTranslation(endUse);
          const edgePoint = transformPoint(drawMatrix, translated);
          add(sourceCycle, endLevel === 1 ? "rising-edge" : "falling-edge", point(edgePoint.x, rowY));
        }
      }
      previousLevel = endLevel;
    }
  }

  const period = waveJson.period ?? 1;
  let previousToken: string | undefined;
  for (let slot = 0; slot < waveJson.wave.length; slot += 1) {
    const token = waveJson.wave[slot];
    if (!token || token === "." || token === "|") continue;
    const localCycle = slot * period;
    const boundary = boundaries[localCycle];
    if (!boundary) continue;
    const sourceCycle = sourceCycleAt(localCycle);
    const originalHalfBrick = localCycle * 2;
    const visibleIndex = originalHalfBrick - clippedHalfBricks;
    const use = uses[visibleIndex];
    let valueStart = boundary;
    if (slot > 0 && use) {
      const segments = transitionSegments(svg, hrefOf(use), transitionCache, metrics);
      const interval = segments.length === 0 ? undefined : { start: Math.min(...segments.map((item) => Math.min(item.start.x, item.end.x))), end: Math.max(...segments.map((item) => Math.max(item.start.x, item.end.x))) };
      const segment = segments[0];
      if (interval && segment) {
        const translated = useTranslation(use);
        const start = transformPoint(drawMatrix, point(translated.x + interval.start, translated.y));
        const end = transformPoint(drawMatrix, point(translated.x + interval.end, translated.y));
        const center = point((start.x + end.x) / 2, rowY);
        add(sourceCycle, "transition-start", point(start.x, rowY));
        add(sourceCycle, "transition-center", center);
        add(sourceCycle, "transition-end", point(end.x, rowY));
        for (const threshold of [0.3, 0.7]) {
          const thresholdPoint = interpolateSegment(segment, threshold);
          const transformed = transformPoint(drawMatrix, point(translated.x + thresholdPoint.x, translated.y + thresholdPoint.y));
          add(sourceCycle, "transition-center", transformed, threshold);
        }
        transitionResolvers.push({ cycle: sourceCycle, point: "transition-center", resolve: (fraction) => {
          const thresholdPoint = interpolateSegment(segment, fraction);
          return transformPoint(drawMatrix, point(translated.x + thresholdPoint.x, translated.y + thresholdPoint.y));
        } });
        valueStart = point(end.x, rowY);
        if (!waveJson.clock?.expanded) {
          if (previousToken === "0" && token === "1") add(sourceCycle, "rising-edge", center);
          if (previousToken === "1" && token === "0") add(sourceCycle, "falling-edge", center);
        }
      }
    }
    add(sourceCycle, "value-start", valueStart);
    previousToken = token;
  }
  if (metrics) {
    const accumulatorMetrics = accumulator.metrics();
    metrics.geometryEntriesEmitted = accumulatorMetrics.geometryEntriesEmitted;
    metrics.duplicateKeyChecks = accumulatorMetrics.duplicateKeyChecks;
    metrics.duplicateKeyCollisions = accumulatorMetrics.duplicateKeyCollisions;
    metrics.signalId = rendered.signalId;
    metrics.durationMs = (globalThis.performance?.now() ?? Date.now()) - startedAt;
  }
  return new ImmutableLocalGeometryMap(rendered.signalId, accumulator.entries(), transitionResolvers);
}
