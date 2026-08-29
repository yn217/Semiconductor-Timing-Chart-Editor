import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("View exposes stable Show/Panels/Guides/Zoom/Workspace/Layout slots", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const surface = page.locator("[data-role='timing-chart-surface']");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  await expect(page.locator(".ribbon-major-group")).toHaveCount(6);
  await expect(page.locator(".ribbon-major-group").first()).toHaveAttribute("data-major-group", "Show");
  await expect(page.locator(".ribbon-major-group").nth(1)).toHaveAttribute("data-major-group", "Panels");
  await expect(page.locator(".ribbon-major-group").nth(2)).toHaveAttribute("data-major-group", "Guides");
  await expect(page.locator(".ribbon-major-group").nth(3)).toHaveAttribute("data-major-group", "Zoom");
  await expect(page.locator(".ribbon-major-group").nth(4)).toHaveAttribute("data-major-group", "Workspace");
  await expect(page.locator(".ribbon-major-group").nth(5)).toHaveAttribute("data-major-group", "Layout");
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Zoom Out" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Zoom In" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Fit All" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Workspace preset")).toBeVisible();

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await shell.getAttribute("data-workspace-preset"),
  };
  await page.getByTestId("view-show-roles").uncheck();
  await page.getByTestId("grid-toggle").uncheck();
  await page.getByTestId("view-panel-minimap").uncheck();
  await expect(shell).toHaveAttribute("data-show-roles", "false");
  await expect(shell).toHaveAttribute("data-minimap-enabled", "false");
  expect(await surface.getAttribute("data-canonical-revision")).toBe(before.revision);
  expect(await surface.getAttribute("data-history-depth")).toBe(before.history);
  expect(await shell.getAttribute("data-workspace-preset")).toBe(before.dirty);
});

test("View zoom uses a shared view-only route and does not move Home presentation", async ({ page }) => {
  await page.goto("/");
  const ribbon = page.getByTestId("ribbon");
  const surface = page.locator("[data-role='timing-chart-surface']");
  const home = page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true });
  await home.click();
  const homeZoom = page.locator("[data-major-group='Zoom']");
  const homeX = (await homeZoom.boundingBox())?.x ?? -1;
  const beforeRevision = await surface.getAttribute("data-canonical-revision");
  const beforeHistory = await surface.getAttribute("data-history-depth");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const viewZoom = page.locator("[data-major-group='Zoom']");
  await expect(viewZoom).toBeVisible();
  expect((await viewZoom.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(600);
  await ribbon.getByRole("button", { name: "Zoom In" }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator("[data-major-group='Zoom']")).toBeVisible();
  expect((await page.locator("[data-major-group='Zoom']").boundingBox())?.x ?? -1).toBe(homeX);
  expect(await surface.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await surface.getAttribute("data-history-depth")).toBe(beforeHistory);
});

test("View groups compress without horizontal overflow at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.locator("[data-major-group]")).toHaveCount(6);
  const metrics = await ribbon.evaluate((node) => {
    const root = node.getBoundingClientRect();
    const groups = [...node.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => group.getBoundingClientRect());
    return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, right: Math.max(...groups.map((group) => group.right)), viewportRight: root.right };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportRight + 1);
  await expect(ribbon.getByLabel("Zoom preset")).toBeVisible();
  await expect(ribbon.getByLabel("Workspace preset")).toBeVisible();
});
