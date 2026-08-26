import { ImmutableLocalGeometryMap, type LocalGeometryEntry, type Point } from "@timing-chart-v2/geometry";
import type { AnchorPoint } from "@timing-chart-v2/schema";
import { WaveDromAdapterError, type RenderedWave } from "./types.js";

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

function transitionInterval(svg: SVGElement, brickId: string): Readonly<{ start: number; end: number }> | undefined {
  const brick = Array.from(svg.querySelectorAll<SVGGElement>("defs g[id]")).find((item) => item.id === brickId);
  if (!brick) throw new WaveDromAdapterError("MISSING_WAVEDROM_BRICK", `Rendered SVG does not contain brick '${brickId}'.`);
  const intervals: Array<Readonly<{ start: number; end: number }>> = [];
  for (const path of Array.from(brick.querySelectorAll<SVGPathElement>("path.s1"))) {
    const d = path.getAttribute("d");
    if (!d) continue;
    for (const segment of parsePrimaryStroke(d)) {
      const ys = [segment.start.y, segment.control1?.y, segment.control2?.y, segment.end.y].filter((value): value is number => value !== undefined);
      if (Math.max(...ys) === Math.min(...ys)) continue;
      intervals.push({ start: Math.min(segment.start.x, segment.end.x), end: Math.max(segment.start.x, segment.end.x) });
    }
  }
  if (intervals.length === 0) return undefined;
  return { start: Math.min(...intervals.map((item) => item.start)), end: Math.max(...intervals.map((item) => item.end)) };
}

function groupById<T extends Element>(svg: SVGElement, id: string): T {
  const element = Array.from(svg.querySelectorAll<T>("[id]")).find((item) => item.id === id);
  if (!element) throw new WaveDromAdapterError("INVALID_WAVEDROM_STRUCTURE", `Rendered SVG is missing '${id}'.`);
  return element;
}

function matrixOf(group: SVGGElement): MatrixLike {
  const matrix = group.getCTM();
  if (!matrix) throw new WaveDromAdapterError("DETACHED_WAVEDROM_SVG", "WaveDrom SVG must be mounted before Local Geometry extraction.");
  return matrix;
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

function add(entries: LocalGeometryEntry[], cycle: number, anchorPoint: AnchorPoint, position: Point): void {
  if (!entries.some((entry) => entry.cycle === cycle && entry.point === anchorPoint)) entries.push({ cycle, point: anchorPoint, position });
}

export function extractLocalGeometry(rendered: RenderedWave): ImmutableLocalGeometryMap {
  const { svg, renderIndex, waveJson } = rendered;
  const lanes = groupById<SVGGElement>(svg, `lanes_${renderIndex}`);
  const draw = groupById<SVGGElement>(svg, `wavelane_draw_0_${renderIndex}`);
  const laneMatrix = matrixOf(lanes);
  const drawMatrix = matrixOf(draw);
  const gridLines = Array.from(lanes.querySelectorAll<SVGLineElement>(`[id^="gmark_"]`))
    .map((line) => ({ x: Number(line.getAttribute("x1")), y1: Number(line.getAttribute("y1")), y2: Number(line.getAttribute("y2")) }))
    .filter((line) => [line.x, line.y1, line.y2].every(Number.isFinite))
    .sort((left, right) => left.x - right.x);
  if (gridLines.length < 2) throw new WaveDromAdapterError("MISSING_CYCLE_GRID", "WaveDrom SVG does not expose at least one complete cycle.");

  const boundaries = gridLines.map((line) => transformPoint(laneMatrix, point(line.x, (line.y1 + line.y2) / 2)));
  const entries: LocalGeometryEntry[] = [];
  for (let cycle = 0; cycle < boundaries.length - 1; cycle += 1) {
    const start = boundaries[cycle];
    const end = boundaries[cycle + 1];
    if (!start || !end) continue;
    add(entries, cycle, "cycle-start", start);
    add(entries, cycle, "cycle-center", point((start.x + end.x) / 2, (start.y + end.y) / 2));
    add(entries, cycle, "value-center", point((start.x + end.x) / 2, (start.y + end.y) / 2));
    add(entries, cycle, "row-center", point((start.x + end.x) / 2, (start.y + end.y) / 2));
    add(entries, cycle, "cycle-end", end);
  }
  // The terminal timeline boundary (cycle == cycleCount, i.e. the half-open range's exclusive end)
  // has no per-cycle slot of its own - it's only ever the "cycle-end" of the last cycle. Store it as
  // a resolvable "cycle-start" at that boundary index too, so callers (Ruler final tick, a Transaction
  // or TimeGroup ending exactly at cycleCount) can resolve it directly instead of extrapolating.
  const terminalCycle = boundaries.length - 1;
  const terminalBoundary = boundaries[terminalCycle];
  if (terminalBoundary) add(entries, terminalCycle, "cycle-start", terminalBoundary);

  const phaseHalfBricks = (waveJson.phase ?? 0) * 2;
  if (!Number.isInteger(phaseHalfBricks)) throw new WaveDromAdapterError("UNSUPPORTED_GEOMETRY_PHASE", "Geometry extraction requires half-cycle-aligned WaveDrom phase.");
  const clippedHalfBricks = Math.max(0, phaseHalfBricks);
  const uses = Array.from(draw.querySelectorAll<SVGUseElement>("use"));
  const rowY = boundaries[0]?.y ?? 0;

  for (let visibleIndex = 0; visibleIndex < uses.length; visibleIndex += 1) {
    const use = uses[visibleIndex];
    if (!use) continue;
    const originalHalfBrick = visibleIndex + clippedHalfBricks;
    const cycle = Math.floor(originalHalfBrick / 2);
    if (cycle < 0 || cycle >= boundaries.length - 1) continue;
    const href = hrefOf(use);
    const translated = useTranslation(use);
    const origin = transformPoint(drawMatrix, translated);
    if (href === "pclk" || href === "Pclk") add(entries, cycle, "rising-edge", point(origin.x, rowY));
    if (href === "nclk" || href === "Nclk") add(entries, cycle, "falling-edge", point(origin.x, rowY));
  }

  const period = waveJson.period ?? 1;
  for (let slot = 0; slot < waveJson.wave.length; slot += 1) {
    const token = waveJson.wave[slot];
    if (!token || token === "." || token === "|") continue;
    const cycle = slot * period;
    const boundary = boundaries[cycle];
    if (!boundary) continue;
    const originalHalfBrick = cycle * 2;
    const visibleIndex = originalHalfBrick - clippedHalfBricks;
    const use = uses[visibleIndex];
    let valueStart = boundary;
    if (slot > 0 && use) {
      const interval = transitionInterval(svg, hrefOf(use));
      if (interval) {
        const translated = useTranslation(use);
        const start = transformPoint(drawMatrix, point(translated.x + interval.start, translated.y));
        const end = transformPoint(drawMatrix, point(translated.x + interval.end, translated.y));
        const center = point((start.x + end.x) / 2, rowY);
        add(entries, cycle, "transition-start", point(start.x, rowY));
        add(entries, cycle, "transition-center", center);
        add(entries, cycle, "transition-end", point(end.x, rowY));
        valueStart = point(end.x, rowY);
        const previous = [...waveJson.wave.slice(0, slot)].reverse().find((item) => item !== "." && item !== "|");
        if (previous === "0" && token === "1") add(entries, cycle, "rising-edge", center);
        if (previous === "1" && token === "0") add(entries, cycle, "falling-edge", center);
      }
    }
    add(entries, cycle, "value-start", valueStart);
  }
  return new ImmutableLocalGeometryMap(rendered.signalId, entries);
}
