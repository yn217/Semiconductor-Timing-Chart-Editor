import { useEffect, useRef, useState } from "react";
import { ProductionWaveDromAdapter, analyticLocalGeometry, type WaveJsonSignal } from "@timing-chart-v2/wavedrom-adapter";
import type { AnchorPoint, ClockSignal, SignalId, ValueSignal } from "@timing-chart-v2/schema";

// #755: dev/test-only harness. Renders WaveJson cases through the real production adapter, extracts Local Geometry from the
// SVG DOM, and compares it anchor-by-anchor with the renderer-independent analytic producer. Result on
// window.__geometryEquivalence. Loaded only via ?probe=geometry-equivalence (see main.tsx).

const POINTS: readonly AnchorPoint[] = ["cycle-start", "cycle-center", "cycle-end", "transition-start", "transition-center", "transition-end", "rising-edge", "falling-edge", "value-start", "value-center", "row-center"];
const TOLERANCE = 0.01;

const clock = (period: number, duty: number, phase: number, initial: 0 | 1): ClockSignal => ({
  id: "sig_clock" as SignalId, name: "CLK", type: "clock", role: "input", source: { instancePath: [], signalName: "CLK" }, display: { name: "CLK" },
  generator: { start: 0, period, duty, phase, initial, polarity: "positive" },
  edgeCounter: { show: false, mode: "both", startNumber: 1, countFrom: "signal-start", labelEvery: 1, position: "above", offset: { x: 0, y: -6 } },
});
const bus = (values: ValueSignal["values"]): ValueSignal => ({ id: "sig_bus" as SignalId, name: "BUS", type: "bus", role: "internal", width: 8, displayFormat: "hex", source: { instancePath: [], signalName: "BUS" }, display: { name: "BUS" }, values });
const bit = (values: ValueSignal["values"]): ValueSignal => ({ id: "sig_bit" as SignalId, name: "BIT", type: "logic", role: "internal", source: { instancePath: [], signalName: "BIT" }, display: { name: "BIT" }, values });

export interface EquivalenceCase { readonly name: string; readonly wave: WaveJsonSignal }

function buildCases(adapter: ProductionWaveDromAdapter): EquivalenceCase[] {
  const literals: [string, WaveJsonSignal][] = [
    ["bit toggles", { wave: "0101.1010" }],
    ["x and z values", { wave: "0x1z0..1zx" }],
    ["bus values", { wave: "=.=x=.z=", data: ["A", "B", "C", "D"] }],
    ["digit bus values", { wave: "2.3.4.5", data: ["a", "b", "c", "d"] }],
    ["clock p with repeats", { wave: "p......." }],
    ["clock n with repeats", { wave: "n......." }],
    ["clock P N h l", { wave: "P.N.hlHL" }],
    ["phase 0.5", { wave: "0101010", phase: 0.5 }],
    ["gaps as repeats", { wave: "01|.0|.1" }],
    ["period 2 bit and bus", { wave: "01x=", data: ["Q"], period: 2 }],
    ["negative-phase-free folds", { wave: "0101010101", geometrySourceCycles: [0, 1, 2, 5, 6, 7, 20, 21, 22, 23, 24] }],
    ["windowed source cycles", { wave: "0101010101", geometrySourceCycles: Array.from({ length: 11 }, (_, index) => 100 + index), sourceWindow: { start: 100, end: 110 } }],
  ];
  const cases: EquivalenceCase[] = literals.map(([name, wave]) => ({ name, wave }));
  cases.push({ name: "adapter clock period 2 duty 0.5", wave: adapter.toWaveJson({ signal: clock(2, 0.5, 0.5, 0), cycleCount: 16 }) });
  cases.push({ name: "adapter clock period 4 duty 0.25", wave: adapter.toWaveJson({ signal: clock(4, 0.25, 0, 0), cycleCount: 16 }) });
  cases.push({ name: "adapter bus", wave: adapter.toWaveJson({ signal: bus([{ start: 0, value: "00" }, { start: 3, value: "A5" }, { start: 7, value: "FF" }]), cycleCount: 12 }) });
  cases.push({ name: "adapter bit", wave: adapter.toWaveJson({ signal: bit([{ start: 0, value: 0 }, { start: 2, value: 1 }, { start: 5, value: 0 }, { start: 9, value: "x" }]), cycleCount: 12 }) });
  return cases;
}

async function run() {
  const adapter = new ProductionWaveDromAdapter();
  const results: { name: string; compared: number; mismatches: string[]; error?: string }[] = [];
  for (const testCase of buildCases(adapter)) {
    const owner = document.createElement("div");
    owner.style.cssText = "width:2400px;height:60px;position:relative";
    document.getElementById("equivalence-host")!.appendChild(owner);
    const signalId = `sig_${results.length}` as SignalId;
    try {
      const rendered = await adapter.renderWave(signalId, testCase.wave, owner);
      const svgMap = adapter.extractLocalGeometry(rendered);
      const analytic = analyticLocalGeometry(signalId, testCase.wave);
      const window = testCase.wave.geometryWindow ?? testCase.wave.sourceWindow;
      const firstCycle = window?.start ?? 0;
      const lastCycle = (testCase.wave.geometrySourceCycles?.at(-1) ?? window?.end ?? testCase.wave.wave.length) + 1;
      const mismatches: string[] = [];
      let compared = 0;
      for (let cycle = firstCycle - 1; cycle <= lastCycle; cycle += 1) {
        for (const point of POINTS) {
          const variants: (number | undefined)[] = point === "transition-center" ? [undefined, 0.3, 0.5, 0.7] : [undefined];
          for (const threshold of variants) {
            const anchor = { signalId, cycle, point, ...(threshold === undefined ? {} : { threshold }) } as never;
            const svg = svgMap.find(anchor)?.point;
            const ana = analytic.find(anchor)?.point;
            if (svg === undefined && ana === undefined) continue;
            compared += 1;
            if (svg === undefined || ana === undefined) { mismatches.push(`${cycle}:${point}:${threshold ?? ""} svg=${JSON.stringify(svg)} analytic=${JSON.stringify(ana)}`); continue; }
            if (Math.abs(svg.x - ana.x) > TOLERANCE || Math.abs(svg.y - ana.y) > TOLERANCE) mismatches.push(`${cycle}:${point}:${threshold ?? ""} svg=(${svg.x.toFixed(3)},${svg.y.toFixed(3)}) analytic=(${ana.x.toFixed(3)},${ana.y.toFixed(3)})`);
          }
        }
      }
      results.push({ name: testCase.name, compared, mismatches, wave: JSON.stringify(testCase.wave) } as never);
    } catch (error) {
      results.push({ name: testCase.name, compared: 0, mismatches: [], error: String(error) });
    }
  }
  (window as unknown as { __geometryEquivalence: unknown }).__geometryEquivalence = results;
  return results;
}

export function GeometryEquivalenceProbe() {
  const started = useRef(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run().then(() => setDone(true));
  }, []);
  return <div><div id="equivalence-host" /><output data-testid="equivalence-done">{done ? "done" : "running"}</output></div>;
}
