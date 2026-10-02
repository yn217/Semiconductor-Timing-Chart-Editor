import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

/**
 * #936: a canonical source-cycle Annotation anchor must land on the same X as the Ruler tick for that source cycle whether the
 * Signal geometry is display-keyed (small, full render) or source-keyed (large document, bounded window), with a collapsed fold
 * in front of the anchor.
 */
for (const { name, signalCount, cycleCount } of [{ name: "full render", signalCount: 6, cycleCount: 64 }, { name: "bounded window", signalCount: 60, cycleCount: 10_000 }]) {
  test(`folded verticalLine anchor aligns with its Ruler tick (${name})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const base = generatePerformanceDocument({ signalCount, cycleCount, profile: "standard" });
    const document = {
      ...base,
      timeGroups: [{ id: "tg_fold936", name: "Fold", start: 2, end: 6, category: "collapsed", presentation: { collapsed: true, foldStyle: "axis-break", foldLabel: "4 cycles" } }],
      annotations: [{ id: "ann_936_line", type: "verticalLine", label: "L24", visible: true, anchor: { signalId: base.signals[1]!.id, cycle: 24, point: "cycle-start" } }],
    };
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "p936.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    const tick = page.locator(".cycle-ruler [data-cycle='24']").first();
    const body = surface.locator("[data-role='annotation-owner'][data-annotation-id='ann_936_line'] [data-role='annotation-body']");
    await expect(tick).toBeVisible();
    await expect(body).toBeAttached();
    const tickBox = (await tick.boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    expect(Math.abs(tickBox.x - bodyBox.x), `ruler tick x=${tickBox.x} annotation x=${bodyBox.x}`).toBeLessThan(1.5);
  });
}
