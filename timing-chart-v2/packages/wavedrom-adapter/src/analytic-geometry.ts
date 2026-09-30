import WaveDrom from "wavedrom";
import { ImmutableLocalGeometryMap, WAVEDROM_CYCLE_WIDTH, WAVEDROM_ORIGIN_X, type LocalGeometryEntry, type Point, type TransitionGeometryResolver } from "@timing-chart-v2/geometry";
import type { SignalId } from "@timing-chart-v2/schema";
import type { WaveJsonSignal } from "./types.js";
import { createGeometryEntryAccumulator, interpolateSegment, parsePrimaryStroke, type Segment } from "./geometry-extractor.js";

/**
 * Renderer-independent Local Geometry (#755): the same LocalGeometryMap the SVG extractor derives from the rendered DOM,
 * computed from the WaveJson and WaveDrom's pinned (3.6.2) brick layout + default skin instead. No SVG is created or read,
 * so a non-SVG renderer (Canvas) can publish geometry for Snap / Annotation anchoring / Edge Counter.
 *
 * Equivalence with the SVG extractor is enforced by tests/e2e/issue-755-analytic-geometry-equivalence.spec.ts.
 */

// ---- WaveDrom brick sequence (port of wavedrom@3.6.2 lib/gen-brick.js, gen-first-wave-brick.js, gen-wave-brick.js, parse-wave-lane.js) ----
const FIRST: Readonly<Record<string, string | readonly string[]>> = {
  p: ["pclk", "111", "nclk", "000"], n: ["nclk", "000", "pclk", "111"], P: ["Pclk", "111", "nclk", "000"], N: ["Nclk", "000", "pclk", "111"],
  l: "000", L: "000", 0: "000", h: "111", H: "111", 1: "111",
  "=": "vvv-2", 2: "vvv-2", 3: "vvv-3", 4: "vvv-4", 5: "vvv-5", 6: "vvv-6", 7: "vvv-7", 8: "vvv-8", 9: "vvv-9", d: "ddd", u: "uuu", z: "zzz",
};
const genBrick = (texts: string | readonly string[], extra: number, times: number): string[] => {
  const list = Array.isArray(texts) ? [...texts] : [texts as string];
  const out: string[] = [];
  if (list.length === 4) {
    for (let j = 0; j < times; j += 1) {
      out.push(list[0]!);
      for (let i = 0; i < extra; i += 1) out.push(list[1]!);
      out.push(list[2]!);
      for (let i = 0; i < extra; i += 1) out.push(list[3]!);
    }
    return out;
  }
  if (list.length === 1) list.push(list[0]!);
  out.push(list[0]!);
  for (let i = 0; i < times * (2 * (extra + 1)) - 1; i += 1) out.push(list[1]!);
  return out;
};
const X1: Record<string, string> = { p: "pclk", n: "nclk", P: "Pclk", N: "Nclk", h: "pclk", l: "nclk", H: "Pclk", L: "Nclk" };
const X2: Record<string, string> = { 0: "0", 1: "1", x: "x", d: "d", u: "u", z: "z", "=": "v", 2: "v", 3: "v", 4: "v", 5: "v", 6: "v", 7: "v", 8: "v", 9: "v" };
const X3: Record<string, string> = { 0: "", 1: "", x: "", d: "", u: "", z: "", "=": "-2", 2: "-2", 3: "-3", 4: "-4", 5: "-5", 6: "-6", 7: "-7", 8: "-8", 9: "-9" };
const Y1: Record<string, string> = { p: "0", n: "1", P: "0", N: "1", h: "1", l: "0", H: "1", L: "0", 0: "0", 1: "1", x: "x", d: "d", u: "u", z: "z", "=": "v", 2: "v", 3: "v", 4: "v", 5: "v", 6: "v", 7: "v", 8: "v", 9: "v" };
const Y2: Record<string, string> = { p: "", n: "", P: "", N: "", h: "", l: "", H: "", L: "", 0: "", 1: "", x: "", d: "", u: "", z: "", "=": "-2", 2: "-2", 3: "-3", 4: "-4", 5: "-5", 6: "-6", 7: "-7", 8: "-8", 9: "-9" };
const X4: Record<string, string> = { p: "111", n: "000", P: "111", N: "000", h: "111", l: "000", H: "111", L: "000", 0: "000", 1: "111", x: "xxx", d: "ddd", u: "uuu", z: "zzz", "=": "vvv-2", 2: "vvv-2", 3: "vvv-3", 4: "vvv-4", 5: "vvv-5", 6: "vvv-6", 7: "vvv-7", 8: "vvv-8", 9: "vvv-9" };
const X5: Record<string, string> = { p: "nclk", n: "pclk", P: "nclk", N: "pclk" };
const X6: Record<string, string> = { p: "000", n: "111", P: "000", N: "111" };
const XCLUDE: Record<string, string> = { hp: "111", Hp: "111", ln: "000", Ln: "000", nh: "111", Nh: "111", pl: "000", Pl: "000" };
const genWaveBrick = (text: string, extra: number, times: number): string[] => {
  const [previous, current] = text.split("") as [string, string];
  const tmp0 = X4[current];
  let tmp1 = X1[current];
  if (tmp1 === undefined) {
    const tmp2 = X2[current];
    const tmp3 = Y1[previous];
    if (tmp2 === undefined || tmp3 === undefined) return genBrick("xxx", extra, times);
    return genBrick([`${tmp3}m${tmp2}${Y2[previous]}${X3[current]}`, tmp0!], extra, times);
  }
  const excluded = XCLUDE[text];
  if (excluded !== undefined) tmp1 = excluded;
  const tmp5 = X5[current];
  if (tmp5 === undefined) return genBrick([tmp1, tmp0!], extra, times);
  return genBrick([tmp1, tmp0!, tmp5, X6[current]!], extra, times);
};

/** Half-cycle brick ids for a wave string (unshifted by phase). Sub-cycle markers are not produced by the adapter. */
export function waveBrickSequence(wave: string, extra = 0): readonly string[] {
  const stack = wave.split("");
  let next = stack.shift() ?? ".";
  let repeats = 1;
  while (stack[0] === "." || stack[0] === "|") { stack.shift(); repeats += 1; }
  let bricks: string[] = genBrick(FIRST[next] ?? "xxx", extra, repeats);
  while (stack.length) {
    const top = next;
    next = stack.shift()!;
    repeats = 1;
    while (stack[0] === "." || stack[0] === "|") { stack.shift(); repeats += 1; }
    bricks = bricks.concat(genWaveBrick(top + next, extra, repeats));
  }
  return bricks;
}

// ---- skin brick primary strokes (from the pinned default skin, no DOM) ----
type OnmlNode = readonly unknown[];
let skinStrokeCache: Map<string, readonly Segment[]> | undefined;
function skinTransitionSegments(brickId: string): readonly Segment[] {
  if (!skinStrokeCache) {
    skinStrokeCache = new Map();
    const skin = (WaveDrom.waveSkin as unknown as { default: OnmlNode }).default;
    const defs = skin[3] as OnmlNode;
    for (const entry of defs.slice(1) as OnmlNode[]) {
      const attrs = entry[1] as { id?: string } | undefined;
      if (entry[0] !== "g" || !attrs?.id) continue;
      const segments: Segment[] = [];
      for (const child of entry.slice(2) as OnmlNode[]) {
        const childAttrs = child[1] as { class?: string; d?: string } | undefined;
        if (child[0] !== "path" || childAttrs?.class !== "s1" || !childAttrs.d) continue;
        for (const segment of parsePrimaryStroke(childAttrs.d)) {
          const ys = [segment.start.y, segment.control1?.y, segment.control2?.y, segment.end.y].filter((value): value is number => value !== undefined);
          if (Math.max(...ys) === Math.min(...ys)) continue;
          segments.push(segment);
        }
      }
      skinStrokeCache.set(attrs.id, Object.freeze(segments));
    }
  }
  return skinStrokeCache.get(brickId) ?? [];
}

const HALF_BRICK = WAVEDROM_CYCLE_WIDTH / 2;
/** Vertical placement of a single lane in WaveDrom's default skin (verified against the SVG extractor). */
export const WAVEDROM_ROW_Y = 15.5;
/** Brick origin y inside the lane draw group; skin strokes are expressed relative to it. */
export const WAVEDROM_DRAW_Y = 5.5;

const clockLevel = (token: string, initial: 0 | 1): readonly [0 | 1, 0 | 1] => {
  if (token === "." || token === "|") return [initial, initial];
  if (token === "p") return [1, 0];
  if (token === "n") return [0, 1];
  if (token === "0" || token === "1") return [Number(token) as 0 | 1, Number(token) as 0 | 1];
  return [initial, initial];
};

/** Analytic counterpart of extractLocalGeometry(): same entries and transition resolvers, no SVG. */
export function analyticLocalGeometry(signalId: SignalId, waveJson: WaveJsonSignal): ImmutableLocalGeometryMap {
  const sourceStart = waveJson.geometryWindow?.start ?? waveJson.sourceWindow?.start ?? 0;
  const period = waveJson.period ?? 1;
  const window = waveJson.geometryWindow ?? waveJson.sourceWindow;
  const boundaryCount = waveJson.geometrySourceCycles !== undefined ? waveJson.geometrySourceCycles.length
    : window !== undefined ? (window.end - window.start) + 1
    : waveJson.wave.length * period + 1;
  const boundaries: Point[] = Array.from({ length: boundaryCount }, (_, index) => ({ x: WAVEDROM_ORIGIN_X + index * WAVEDROM_CYCLE_WIDTH, y: WAVEDROM_ROW_Y }));
  const sourceCycleAt = (local: number): number => waveJson.geometrySourceCycles?.[local] ?? local + sourceStart;
  const accumulator = createGeometryEntryAccumulator();
  const add = accumulator.add;
  for (let cycle = 0; cycle < boundaries.length - 1; cycle += 1) {
    const start = boundaries[cycle]!;
    const end = boundaries[cycle + 1]!;
    const sourceCycle = sourceCycleAt(cycle);
    const center: Point = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    add(sourceCycle, "cycle-start", start);
    add(sourceCycle, "cycle-center", center);
    add(sourceCycle, "value-center", center);
    add(sourceCycle, "row-center", center);
    add(sourceCycle, "cycle-end", end);
  }
  const terminal = boundaries.length - 1;
  if (boundaries[terminal]) add(sourceCycleAt(terminal), "cycle-start", boundaries[terminal]!);

  const phaseHalfBricks = (waveJson.phase ?? 0) * 2;
  const clipped = Math.max(0, phaseHalfBricks);
  const bricks = waveBrickSequence(waveJson.wave, period - 1).slice(clipped);
  const brickOrigin = (visibleIndex: number): Point => ({ x: WAVEDROM_ORIGIN_X + visibleIndex * HALF_BRICK, y: WAVEDROM_DRAW_Y });
  const rowY = boundaries[0]?.y ?? 0;
  const resolvers: TransitionGeometryResolver[] = [];

  if (!waveJson.clock?.expanded) {
    for (let visibleIndex = 0; visibleIndex < bricks.length; visibleIndex += 1) {
      const localCycle = Math.floor((visibleIndex + clipped) / 2);
      if (localCycle < 0 || localCycle >= boundaries.length - 1) continue;
      const href = bricks[visibleIndex]!;
      const origin = brickOrigin(visibleIndex);
      if (href === "pclk" || href === "Pclk") add(sourceCycleAt(localCycle), "rising-edge", { x: origin.x, y: rowY });
      if (href === "nclk" || href === "Nclk") add(sourceCycleAt(localCycle), "falling-edge", { x: origin.x, y: rowY });
    }
  } else {
    const slotBricks = new Map<number, number[]>();
    bricks.forEach((_, visibleIndex) => {
      const slot = Math.floor((visibleIndex + clipped) / 2);
      const list = slotBricks.get(slot);
      if (list) list.push(visibleIndex); else slotBricks.set(slot, [visibleIndex]);
    });
    let previousLevel: 0 | 1 = waveJson.clock.initial;
    for (let slot = 0; slot < waveJson.wave.length; slot += 1) {
      const token = waveJson.wave[slot] ?? ".";
      const [startLevel, endLevel] = clockLevel(token, previousLevel);
      const boundary = boundaries[slot];
      if (!boundary) continue;
      const sourceCycle = sourceCycleAt(slot);
      if (startLevel !== previousLevel) add(sourceCycle, startLevel === 1 ? "rising-edge" : "falling-edge", boundary);
      if (startLevel !== endLevel) {
        const indices = slotBricks.get(slot) ?? [];
        const targetHref = startLevel === 1 ? "pclk" : "nclk";
        const edgeIndex = indices.find((index) => bricks[index] === targetHref);
        if (edgeIndex !== undefined) add(sourceCycle, startLevel === 1 ? "rising-edge" : "falling-edge", { x: brickOrigin(edgeIndex).x, y: rowY });
        const endHref = endLevel === 1 ? "pclk" : "nclk";
        const endIndex = indices.find((index) => bricks[index] === endHref && index !== edgeIndex);
        if (endIndex !== undefined) add(sourceCycle, endLevel === 1 ? "rising-edge" : "falling-edge", { x: brickOrigin(endIndex).x, y: rowY });
      }
      previousLevel = endLevel;
    }
  }

  let previousToken: string | undefined;
  for (let slot = 0; slot < waveJson.wave.length; slot += 1) {
    const token = waveJson.wave[slot];
    if (!token || token === "." || token === "|") continue;
    const localCycle = slot * period;
    const boundary = boundaries[localCycle];
    if (!boundary) continue;
    const sourceCycle = sourceCycleAt(localCycle);
    const visibleIndex = localCycle * 2 - clipped;
    const brickId = bricks[visibleIndex];
    let valueStart = boundary;
    if (slot > 0 && brickId !== undefined) {
      const segments = skinTransitionSegments(brickId);
      const segment = segments[0];
      if (segments.length > 0 && segment) {
        const intervalStart = Math.min(...segments.map((item) => Math.min(item.start.x, item.end.x)));
        const intervalEnd = Math.max(...segments.map((item) => Math.max(item.start.x, item.end.x)));
        const origin = brickOrigin(visibleIndex);
        const start: Point = { x: origin.x + intervalStart, y: origin.y };
        const end: Point = { x: origin.x + intervalEnd, y: origin.y };
        const center: Point = { x: (start.x + end.x) / 2, y: rowY };
        add(sourceCycle, "transition-start", { x: start.x, y: rowY });
        add(sourceCycle, "transition-center", center);
        add(sourceCycle, "transition-end", { x: end.x, y: rowY });
        for (const threshold of [0.3, 0.7]) {
          const local = interpolateSegment(segment, threshold);
          add(sourceCycle, "transition-center", { x: origin.x + local.x, y: origin.y + local.y }, threshold);
        }
        resolvers.push({ cycle: sourceCycle, point: "transition-center", resolve: (fraction) => {
          const local = interpolateSegment(segment, fraction);
          return { x: origin.x + local.x, y: origin.y + local.y };
        } });
        valueStart = { x: end.x, y: rowY };
        if (!waveJson.clock?.expanded) {
          if (previousToken === "0" && token === "1") add(sourceCycle, "rising-edge", center);
          if (previousToken === "1" && token === "0") add(sourceCycle, "falling-edge", center);
        }
      }
    }
    add(sourceCycle, "value-start", valueStart);
    previousToken = token;
  }
  return new ImmutableLocalGeometryMap(signalId, accumulator.entries() as readonly LocalGeometryEntry[], resolvers, waveJson.geometryCycleDomain ?? "source");
}
