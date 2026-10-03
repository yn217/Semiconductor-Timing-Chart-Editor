import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #936 closure: with MULTIPLE and NESTED collapsed folds in front of the anchors, a Signal-anchored verticalLine, a range crossing a
 * fold, and a marker all land on the Ruler tick of their canonical source cycle, in the full (display-keyed) render and in the bounded
 * (source-keyed) window after a far re-window. Snap through a fold is covered by annotation-snap.spec.ts ("Axis Break snap").
 */
for (const { name, signalCount, cycleCount, base, far, line, rangeStart, rangeEnd, marker } of [
  { name: "full render", signalCount: 6, cycleCount: 64, base: 30, far: false, line: 34, rangeStart: 32, rangeEnd: 42, marker: 38 },
  { name: "bounded window after far re-window", signalCount: 60, cycleCount: 10_000, base: 9_960, far: true, line: 9_980, rangeStart: 9_939, rangeEnd: 9_961, marker: 9_920 },
]) {
  test(`nested + multiple folds keep verticalLine / range / marker on their Ruler ticks (${name})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const generated = generatePerformanceDocument({ signalCount, cycleCount, profile: "standard" });
    const signalId = generated.signals[1]!.id;
    const fold = (id: string, start: number, end: number, parentId?: string) => ({ id, name: id, start, end, category: "collapsed", ...(parentId === undefined ? {} : { parentId }), presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: `${end - start} cycles` } });
    const anchor = (cycle: number) => ({ signalId, cycle, point: "cycle-start" });
    const document = {
      ...generated,
      timeGroups: [fold("tg_outer", 2, 14), fold("tg_inner", 4, 8, "tg_outer"), fold("tg_second", 16, 20), fold("tg_third", base - 3, base - 1)],
      annotations: [
        { id: "ann_line", type: "verticalLine", label: "L", visible: true, anchor: anchor(line) },
        { id: "ann_range", type: "range", label: "R", visible: true, start: anchor(rangeStart), end: anchor(rangeEnd) },
        { id: "ann_marker", type: "marker", label: "M", visible: true, anchor: anchor(marker) },
      ],
    };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p936-multi.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    if (far) {
      const timeline = page.locator("[data-role='timeline-viewport']");
      await timeline.evaluate((element) => { element.scrollLeft = element.scrollWidth - element.clientWidth; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
      await expect.poll(() => timeline.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    }
    const tickX = async (cycle: number) => {
      const tick = page.locator(`.cycle-ruler [data-cycle='${cycle}']`).first();
      await expect(tick, `Ruler tick for source cycle ${cycle}`).toBeVisible();
      return (await tick.boundingBox())!.x;
    };
    const owner = (id: string) => surface.locator(`[data-role='annotation-owner'][data-annotation-id='${id}']`);
    const bodyBox = async (id: string) => {
      const body = owner(id).locator("[data-role='annotation-body']");
      await expect(body).toBeAttached();
      return (await body.boundingBox())!;
    };
    const lineBox = await bodyBox("ann_line");
    expect(Math.abs(lineBox.x - await tickX(line)), "verticalLine").toBeLessThan(1.5);
    const markerBox = await bodyBox("ann_marker");
    expect(Math.abs(markerBox.x + markerBox.width / 2 - await tickX(marker)), "marker centre").toBeLessThan(8);
    const rangeBox = await bodyBox("ann_range");
    expect(Math.abs(rangeBox.x - await tickX(rangeStart)), "range start").toBeLessThan(1.5);
    expect(Math.abs(rangeBox.x + rangeBox.width - await tickX(rangeEnd)), "range end across the fold").toBeLessThan(1.5);
  });
}
