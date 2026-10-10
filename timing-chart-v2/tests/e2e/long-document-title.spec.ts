import { expect, test } from "@playwright/test";

test("a very long Document title is truncated and does not push the View Mode buttons away", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.locator(".ribbon").getByRole("button", { name: "Properties", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  await dialog.getByLabel("Document title").fill("A".repeat(300));
  await dialog.getByRole("button", { name: /Apply/i }).first().click();
  const title = page.getByTestId("titlebar-document-title");
  await expect(title).toContainText("AAAA");
  const geometry = await page.evaluate(() => {
    const heading = document.querySelector("[data-testid='titlebar-document-title']")!.getBoundingClientRect();
    const viewMode = document.querySelector(".view-mode")!.getBoundingClientRect();
    return { titleRight: heading.right, viewModeLeft: viewMode.left, viewModeRight: viewMode.right, innerWidth };
  });
  expect(geometry.titleRight).toBeLessThanOrEqual(geometry.viewModeLeft);
  expect(geometry.viewModeRight).toBeLessThanOrEqual(geometry.innerWidth);
});
