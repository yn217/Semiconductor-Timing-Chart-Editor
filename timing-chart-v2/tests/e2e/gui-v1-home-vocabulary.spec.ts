import { expect, test } from "@playwright/test";

test("restores V1 visible Home Ribbon vocabulary while preserving command names", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const ribbon = page.getByTestId("ribbon");
  const before = {
    revision: await page.getByTestId("revision-status").textContent(),
    history: await page.getByTestId("history-status").textContent(),
    dirty: await page.getByTestId("dirty-status").textContent(),
  };
  await expect(ribbon.locator(".home-file-group > b")).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(ribbon.locator(".home-file-group > b")).toHaveText("File");
  await expect(page.getByTestId("revision-status")).toHaveText(before.revision!);
  await expect(page.getByTestId("history-status")).toHaveText(before.history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(before.dirty!);
});
