import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #936: a canonical source-cycle Annotation anchor must land on the same X as the Ruler tick for that source cycle whether the
 * Signal geometry is display-keyed (small, full render) or source-keyed (large document, bounded window), with a collapsed fold
 * in front of the anchor.
 */
for (const { name, signalCount, cycleCount, anchorCycle, scrollToFarWindow } of [
  { name: "full render", signalCount: 6, cycleCount: 64, anchorCycle: 24, scrollToFarWindow: false },
  { name: "bounded window after far re-window", signalCount: 60, cycleCount: 10_000, anchorCycle: 9_980, scrollToFarWindow: true },
]) {
  test(`folded verticalLine anchor aligns with its Ruler tick (${name})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const base = generatePerformanceDocument({ signalCount, cycleCount, profile: "standard" });
    const sourceSignalId = base.signals[1]!.id;
    const traceStart = anchorCycle - 4;
    const traceEnd = anchorCycle + 4;
    const document = {
      ...base,
      timeGroups: [{ id: "tg_fold936", name: "Fold", start: 2, end: 6, category: "collapsed", presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "4 cycles" } }],
      annotations: [
        { id: "ann_936_line", type: "verticalLine", label: `L${anchorCycle}`, visible: true, anchor: { signalId: sourceSignalId, cycle: anchorCycle, point: "cycle-start" } },
        { id: "ann_936_ghost", type: "ghostTrace", label: `G${anchorCycle}`, visible: true, start: { signalId: sourceSignalId, cycle: traceStart, point: "cycle-start" }, end: { signalId: sourceSignalId, cycle: traceEnd, point: "cycle-start" }, sourceSignalId, traceOffsetCycles: 1 },
      ],
    };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p936.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    const viewport = page.getByTestId("cycle-viewport");
    if (scrollToFarWindow) {
      const dimensions = await page.locator("[data-role='timeline-viewport']").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
      const timelineViewport = page.locator("[data-role='timeline-viewport']");
      await timelineViewport.evaluate((element) => { element.scrollLeft = element.scrollWidth - element.clientWidth; element.dispatchEvent(new Event("scroll", { bubbles: true })); });
      await expect.poll(() => timelineViewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    }
    const tick = page.locator(`.cycle-ruler [data-cycle='${anchorCycle}']`).first();
    const body = surface.locator("[data-role='annotation-owner'][data-annotation-id='ann_936_line'] [data-role='annotation-body']");
    const ghost = surface.locator("[data-role='annotation-owner'][data-annotation-id='ann_936_ghost']");
    const ghostPath = ghost.locator("[data-role='ghost-trace-path']");
    await expect(tick).toBeVisible();
    await expect(body).toBeAttached();
    await expect(ghost).toHaveAttribute("data-source-signal-id", sourceSignalId);
    await expect(ghost).toHaveAttribute("data-trace-offset-cycles", "1");
    await expect(ghostPath).toBeAttached();
    const tickBox = (await tick.boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    const viewportBox = (await page.locator("[data-role='timeline-viewport']").boundingBox())!;
    expect(tickBox.x).toBeGreaterThanOrEqual(viewportBox.x - 1);
    expect(tickBox.x).toBeLessThan(viewportBox.x + viewportBox.width);
    expect(Math.abs(tickBox.x - bodyBox.x), `ruler tick x=${tickBox.x} annotation x=${bodyBox.x}`).toBeLessThan(1.5);

    const comparedTraceSourceCycle = anchorCycle;
    const comparedTracePointIndex = comparedTraceSourceCycle - traceStart - 1;
    const traceTick = page.locator(`.cycle-ruler [data-cycle='${comparedTraceSourceCycle}']`).first();
    await expect(traceTick).toBeVisible();
    const traceGeometry = await ghostPath.evaluate((element) => {
      const points = (element.getAttribute("points") ?? "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(",").map(Number));
      const owner = element.closest("[data-role='annotation-owner']")!;
      return { points, pointCount: points.length, ownerLeft: owner.getBoundingClientRect().left };
    });
    const traceTickBox = (await traceTick.boundingBox())!;
    expect(traceGeometry.pointCount).toBeGreaterThan(1);
    const tracePoint = traceGeometry.points[comparedTracePointIndex];
    expect(tracePoint).toHaveLength(2);
    expect(Number.isFinite(tracePoint![0])).toBe(true);
    expect(Math.abs(traceGeometry.ownerLeft + tracePoint![0] - traceTickBox.x),
      `Ghost Trace source cycle ${comparedTraceSourceCycle} x=${traceGeometry.ownerLeft + tracePoint![0]}, ruler x=${traceTickBox.x}`)
      .toBeLessThan(1.5);
  });
}

/**
 * #936 re-window: after scrolling far enough that the bounded window is REPLACED, the folded Signal-anchored annotations still land on
 * the Ruler tick of their canonical source cycle. A verticalLine is placed at every cycle in 4900..5100 so whichever labelled ticks are
 * visible after the jump have a matching annotation.
 */
test("folded Signal-anchored annotations stay on the Ruler after the bounded window is replaced by a far scroll", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const base = generatePerformanceDocument({ signalCount: 60, cycleCount: 10_000, profile: "standard" });
  const document = {
    ...base,
    timeGroups: [{ id: "tg_fold936b", name: "Fold", start: 2, end: 6, category: "collapsed", presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "4 cycles" } }],
    annotations: Array.from({ length: 201 }, (_, index) => ({ id: `ann_936_w${4900 + index}`, type: "verticalLine", label: `W${4900 + index}`, visible: true, anchor: { signalId: base.signals[1]!.id, cycle: 4900 + index, point: "cycle-start" } })),
  };
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p936b.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const owner = page.locator("[data-role='timeline-viewport']");
  const windowStart = () => page.locator("[data-role='wave-owner'][data-rendered-source-window-start]").first().getAttribute("data-rendered-source-window-start");
  const startBefore = await windowStart();
  await owner.evaluate((element) => { element.scrollLeft = Math.floor(element.scrollWidth * 0.49); });
  // Wait for the bounded window to be replaced (rendered source window moves away from the start).
  await expect.poll(async () => (await windowStart()) !== startBefore, { timeout: 30_000 }).toBe(true);
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });

  const measured = await page.evaluate(() => {
    const ticks = [...document.querySelectorAll<HTMLElement>(".cycle-ruler [data-cycle]")].map((tick) => ({ cycle: tick.dataset.cycle!, x: tick.getBoundingClientRect().left }));
    const rows = ticks.flatMap((tick) => {
      const body = document.querySelector<HTMLElement>(`[data-role='annotation-owner'][data-annotation-id='ann_936_w${tick.cycle}'] [data-role='annotation-body']`);
      return body ? [{ cycle: tick.cycle, delta: body.getBoundingClientRect().left - tick.x }] : [];
    });
    return { ticks: ticks.length, rows };
  });
  expect(measured.rows.length, `visible labelled ticks with an annotation after the re-window (ticks=${measured.ticks})`).toBeGreaterThan(0);
  for (const row of measured.rows) expect(Math.abs(row.delta), `annotation for cycle ${row.cycle} vs its Ruler tick after re-window`).toBeLessThan(1.5);
});
