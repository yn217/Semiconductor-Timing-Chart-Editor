import { expect, test, type Page } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #573 post-closure acceptance: Combined mode has exactly ONE truthful horizontal time-axis scroll owner. Counts elements whose computed
 * overflow-x scrolls AND that really overflow horizontally AND are visible; hiding a second one with CSS does not count as a pass because
 * any hidden-but-scrollable owner is reported too.
 */
const sizes = [{ width: 1280, height: 720 }, { width: 1672, height: 941 }] as const;

const owners = (page: Page) => page.evaluate(() => {
  const found: Array<{ el: string; visible: boolean; scrollWidth: number; clientWidth: number }> = [];
  for (const el of document.querySelectorAll<HTMLElement>(".cycle-panel, .cycle-panel *")) {
    const style = getComputedStyle(el);
    if (!/(auto|scroll)/.test(style.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
    const box = el.getBoundingClientRect();
    found.push({ el: `${el.tagName.toLowerCase()}.${(el.className?.toString() ?? "").split(" ")[0]}[${el.getAttribute("data-testid") ?? el.getAttribute("data-role") ?? ""}]`, visible: box.width > 0 && box.height > 0 && style.visibility !== "hidden", scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  }
  return found;
});

for (const size of sizes) {
  test(`Combined has exactly one horizontal scroll owner across zoom/panels at ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(size);
    await page.goto("/");
    const surface = page.getByTestId("cycle-surface");
    await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
    const document = generatePerformanceDocument({ signalCount: 24, cycleCount: 400, profile: "transaction-heavy" });
    await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "c573.tcd.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
    await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText(/Mode: (Combined|Split)/);
    await expect(page.getByTestId("cycle-viewport")).toHaveAttribute("data-time-viewport-owner", "combined-viewport");
    await expect(page.getByTestId("timeline-hscroll")).toHaveCount(0);
    await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 30_000 });
    const failures: string[] = [];
    const check = async (label: string) => {
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await page.waitForTimeout(250);
      const found = await owners(page);
      if (found.length !== 1 || !found[0]!.visible) failures.push(`${label}: ${JSON.stringify(found)}`);
    };
    await check("initial");
    const ribbon = page.getByTestId("ribbon");
    await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
    await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
    await check("zoom in");
    const fit = ribbon.getByRole("button", { name: /Fit/ }).first();
    if (await fit.count()) { await fit.click(); await check("fit"); }
    await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
    await ribbon.getByRole("button", { name: "Zoom In", exact: true }).click();
    await check("zoom in x3");
    for (const name of ["Inspector", "Bottom Editor", "Signal Tree"]) {
      const toggle = ribbon.getByRole("button", { name, exact: true });
      if (await toggle.count() === 0) continue;
      await toggle.click(); await check(`${name} off`);
      await toggle.click(); await check(`${name} on`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
