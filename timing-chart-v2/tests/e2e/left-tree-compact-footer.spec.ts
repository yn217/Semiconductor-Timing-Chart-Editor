import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

async function ready(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
}

async function verifyCompactFooter(page: import("@playwright/test").Page): Promise<void> {
  await ready(page);
  const host = page.getByTestId("cycle-surface");
  const footer = page.locator(".left-panel-tail");
  await expect(footer).toBeVisible();
  await expect(page.getByTestId("left-tree-signal-count")).toContainText("signals");
  await expect(footer).not.toContainText("Hierarchy");
  await expect(page.locator(".empty-group-list")).toHaveCount(0);

  const footerMetrics = await footer.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(footerMetrics.height).toBeLessThanOrEqual(40);
  expect(footerMetrics.scrollWidth).toBeLessThanOrEqual(footerMetrics.clientWidth);

  const before = {
    revision: await host.getAttribute("data-canonical-revision"),
    history: await host.getAttribute("data-history-depth"),
    dirty: await host.getAttribute("data-dirty"),
  };

  await page.getByRole("button", { name: "Add signal or group" }).click();
  const addMenu = page.getByRole("menu", { name: "Add signal or group" });
  await expect(addMenu.getByRole("menuitem", { name: "Signal", exact: true })).toBeVisible();
  await expect(addMenu.getByRole("menuitem", { name: "Group", exact: true })).toBeVisible();
  await expect(addMenu.getByTestId("bulk-register-open")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "More tree actions" }).click();
  const moreMenu = page.getByRole("menu", { name: "More tree actions" });
  await expect(moreMenu.getByTestId("hierarchy-open")).toBeVisible();
  await moreMenu.getByTestId("hierarchy-open").click();
  await expect(page.getByTestId("hierarchy-browser")).toBeVisible();
  await page.getByRole("button", { name: "Close hierarchy" }).click();

  await expect(host).toHaveAttribute("data-canonical-revision", before.revision!);
  await expect(host).toHaveAttribute("data-history-depth", before.history!);
  expect(await host.getAttribute("data-dirty")).toBe(before.dirty);
}

test("keeps the left tree footer compact at laptop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await verifyCompactFooter(page);
});

test("keeps the left tree footer compact at the Golden viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await verifyCompactFooter(page);
});
