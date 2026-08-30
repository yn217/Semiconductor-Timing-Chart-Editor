import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("View exposes stable Show/Panels/Guides/Zoom/Workspace slots", async ({ page }) => {
  await page.goto("/");
  const shell = page.locator(".editor-shell");
  const surface = page.locator("[data-role='timing-chart-surface']");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  await expect(page.locator(".ribbon-major-group")).toHaveCount(5);
  await expect(page.locator(".ribbon-major-group").first()).toHaveAttribute("data-major-group", "Show");
  await expect(page.locator(".ribbon-major-group").nth(1)).toHaveAttribute("data-major-group", "Panels");
  await expect(page.locator(".ribbon-major-group").nth(2)).toHaveAttribute("data-major-group", "Guides");
  await expect(page.locator(".ribbon-major-group").nth(3)).toHaveAttribute("data-major-group", "Zoom");
  await expect(page.locator(".ribbon-major-group").nth(4)).toHaveAttribute("data-major-group", "Workspace");
  await expect(page.getByTestId("ribbon").getByLabel("Workspace layout actions")).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Zoom Out" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Zoom In" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Fit All" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByRole("button", { name: "Fit Selection" })).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Fit commands")).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Workspace preset")).toBeVisible();
  await expect(page.getByTestId("ribbon").locator(".ds-ribbon-select")).toHaveCount(3);
  const zoomGroup = page.getByTestId("ribbon").getByLabel("Zoom commands");
  await expect(zoomGroup.locator(".ds-ribbon-select")).toHaveCount(1);
  await expect(zoomGroup.getByTestId("zoom-status")).toHaveClass(/visually-hidden/);
  await expect(page.getByTestId("ribbon").getByLabel("Labels and structure")).toBeVisible();
  await expect(page.getByTestId("ribbon").getByLabel("Overlays")).toBeVisible();
  const footerLabels = await page.getByTestId("ribbon").locator(".view-slot-group > .ds-ribbon-group > b").evaluateAll((labels) => labels.map((label) => getComputedStyle(label).visibility));
  expect(footerLabels).toEqual(["hidden", "hidden", "hidden", "hidden", "hidden"]);

  const before = {
    revision: await surface.getAttribute("data-canonical-revision"),
    history: await surface.getAttribute("data-history-depth"),
    dirty: await shell.getAttribute("data-workspace-preset"),
  };
  await page.getByTestId("view-show-roles").uncheck();
  await page.getByTestId("grid-toggle").uncheck();
  await page.getByTestId("view-panel-minimap").click();
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-minimap-enabled", "false");
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
  const homeZoom = page.locator("[data-major-group='Zoom']").filter({ has: page.locator(".home-view-group") });
  const homeX = (await homeZoom.boundingBox())?.x ?? -1;
  const beforeRevision = await surface.getAttribute("data-canonical-revision");
  const beforeHistory = await surface.getAttribute("data-history-depth");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const viewZoom = page.locator(".view-zoom-slot");
  await expect(viewZoom).toBeVisible();
  expect((await viewZoom.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(600);
  await ribbon.getByRole("button", { name: "Zoom In" }).click();
  await expect(page.getByTestId("zoom-status")).toHaveText("125%");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Home", exact: true }).click();
  await expect(homeZoom).toBeVisible();
  expect((await homeZoom.boundingBox())?.x ?? -1).toBe(homeX);
  expect(await surface.getAttribute("data-canonical-revision")).toBe(beforeRevision);
  expect(await surface.getAttribute("data-history-depth")).toBe(beforeHistory);
});

test("View groups compress without horizontal overflow at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const ribbon = page.getByTestId("ribbon");
  await expect(ribbon.locator("[data-major-group]")).toHaveCount(5);
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

test("View group controls stay inside their owned regions", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const metrics = await page.getByTestId("ribbon").evaluate((ribbon) => [...ribbon.querySelectorAll<HTMLElement>("[data-major-group]")].map((group) => {
    const owner = group.querySelector<HTMLElement>(".ds-ribbon-group")!;
    const ownerRect = owner.getBoundingClientRect();
    const children = [...owner.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName !== "B" && getComputedStyle(child).display !== "none");
    return { group: group.dataset.majorGroup, owner: { left: ownerRect.left, right: ownerRect.right, top: ownerRect.top, bottom: ownerRect.bottom }, children: children.map((child) => { const rect = child.getBoundingClientRect(); return { tag: child.tagName, className: child.className, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; }), overflow: children.some((child) => { const rect = child.getBoundingClientRect(); return rect.left < ownerRect.left - 1 || rect.right > ownerRect.right + 1 || rect.top < ownerRect.top - 1 || rect.bottom > ownerRect.bottom + 1; }) };
  }));
  expect(metrics.every((item) => !item.overflow), JSON.stringify(metrics)).toBe(true);
  const fitButtons = await page.getByLabel("Fit commands").getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()));
  expect(fitButtons[0]!.right).toBeLessThanOrEqual(fitButtons[1]!.left + 1);
});
