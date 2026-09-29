import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

/**
 * #895: the auto-selected Canvas painter must preserve WaveDrom's waveform semantics (the normative SVG reference):
 * clock `period`, clock `phase`, the `|` gap symbol and per-Signal `waveformColor`. The real painter module is loaded from the
 * dev server and painted into an owner; pixels are read back from its canvas (the painter itself never reads pixels for geometry).
 */
type Probe = { readonly alphaAt: (x: number, y: number) => number; readonly rgbaAt: (x: number, y: number) => readonly number[] };

async function paint(page: import("@playwright/test").Page, wave: Record<string, unknown>, color?: string) {
  return page.evaluate(async ({ wave: waveJson, color: strokeColor }) => {
    const { paintWaveCanvas } = await import(/* @vite-ignore */ "/src/runtime/canvas-wave-painter.ts") as typeof import("../../apps/editor/src/runtime/canvas-wave-painter.js");
    const owner = document.createElement("div");
    owner.style.cssText = "position:relative;width:2000px;height:30px";
    if (strokeColor) owner.dataset.waveformStyleColor = strokeColor;
    document.body.append(owner);
    paintWaveCanvas(owner, waveJson as never);
    const canvas = owner.querySelector<HTMLCanvasElement>("canvas[data-wave-canvas]")!;
    const context = canvas.getContext("2d")!;
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = Array.from(data.data);
    const width = canvas.width;
    owner.remove();
    return { width, pixels };
  }, { wave, color });
}

const inkAt = (image: { width: number; pixels: number[] }, x: number, yFrom: number, yTo: number): number => {
  let best = 0;
  for (let y = yFrom; y <= yTo; y += 1) best = Math.max(best, image.pixels[(y * image.width + x) * 4 + 3]!);
  return best;
};

test("Canvas honors clock period, phase, gap and waveformColor like WaveDrom", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  const ORIGIN = 20; // WAVEDROM_ORIGIN_X 20.5 -> vertical edge column

  // A. period 4: each `p` spans 4 cycles (160 px): edges at 20 and 180, none at the period-1 pitch (60).
  const period = await paint(page, { wave: "pp", period: 4 });
  expect(inkAt(period, ORIGIN, 8, 22)).toBeGreaterThan(100);
  expect(inkAt(period, ORIGIN + 160, 8, 22)).toBeGreaterThan(100);
  expect(inkAt(period, ORIGIN + 40, 8, 22)).toBe(0);
  expect(inkAt(period, ORIGIN + 80, 8, 22)).toBeGreaterThan(100); // falling edge at half of the 160 px slot

  // B. phase 0.5 shifts the whole lane left by half a cycle: the second slot starts at 20.5 + 40 - 20.
  const phase = await paint(page, { wave: "pp", phase: 0.5 });
  expect(inkAt(phase, ORIGIN + 20, 8, 22)).toBeGreaterThan(100);
  expect(inkAt(phase, ORIGIN + 30, 8, 22)).toBe(0); // unshifted lane would have its slot-1 rise at +40 and none at +20

  // C. `|` draws WaveDrom's gap mask (opaque white) in the slot centre over the otherwise continuous high level.
  const gap = await paint(page, { wave: "1|1" });
  const centre = ORIGIN + 60;
  expect(inkAt(gap, ORIGIN + 10, 5, 6)).toBeGreaterThan(100);
  const at = (x: number, y: number) => gap.pixels.slice((y * gap.width + x) * 4, (y * gap.width + x) * 4 + 4);
  expect(at(centre + 1, 15)).toEqual([255, 255, 255, 255]);

  // D. per-Signal waveformColor is used for the stroke, not a hardcoded ink.
  const coloured = await paint(page, { wave: "1" }, "#ff0000");
  const rows = [5, 6].map((y) => coloured.pixels.slice(((y * coloured.width) + ORIGIN + 10) * 4, ((y * coloured.width) + ORIGIN + 10) * 4 + 4));
  expect(rows.some(([r, g, b, a]) => (a ?? 0) > 100 && (r ?? 0) > 200 && (g ?? 255) < 40 && (b ?? 255) < 40)).toBe(true);
});
