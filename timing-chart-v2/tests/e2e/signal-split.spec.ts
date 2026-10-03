import { expect, test } from "@playwright/test";

// Signal Split View (#200): two viewports over the same Cycle signal list.

test("toggling Signal Split is view-only and Upper's own scroll position survives toggling Lower off and back on", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  const toggle = page.getByTestId("view-panel-signal-split");
  await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);

  await toggle.click();
  await expect(page.getByTestId("cycle-viewport-lower")).toBeVisible();
  await expect(page.getByTestId("cycle-surface-lower")).toBeVisible();
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);

  // #625: the Timeline owns horizontal scroll in Cycle.
  const viewport = page.getByTestId("cycle-viewport").locator("[data-role='timeline-viewport']");
  await page.getByRole("button", { name: "Zoom In", exact: true }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await viewport.evaluate(async (element) => { element.scrollLeft = 60; await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect(page.getByTestId("cycle-ruler-lower").locator(".cycle-ruler-content")).toHaveCSS("transform", await page.getByTestId("cycle-ruler").locator(".cycle-ruler-content").evaluate((element) => getComputedStyle(element).transform));

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  await toggle.click();
  await expect(page.getByTestId("cycle-viewport-lower")).toHaveCount(0);
  await expect(viewport).toHaveJSProperty("scrollLeft", 60);
  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
});
