import { expect, test } from "@playwright/test";

test("document title shows an unsaved indicator that clears on Save", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.getByTestId("titlebar-unsaved-indicator")).toHaveCount(0);
  await page.getByTestId("ribbon").getByRole("button", { name: "Create Transaction", exact: true }).first().click();
  await expect(page.getByTestId("dirty-status")).toHaveText("Modified");
  await expect(page.getByTestId("titlebar-unsaved-indicator")).toHaveText("*");
  await expect(page.getByTestId("titlebar-document-title")).toHaveAttribute("aria-label", /\(unsaved changes\)$/);
  const download = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await download;
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await expect(page.getByTestId("titlebar-unsaved-indicator")).toHaveCount(0);
});
