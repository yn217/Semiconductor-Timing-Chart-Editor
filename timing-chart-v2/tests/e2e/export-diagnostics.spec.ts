import { expect, test } from "@playwright/test";

test("surfaces browser download preparation failures for Export", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.evaluate(() => {
    URL.createObjectURL = () => { throw new Error("download API unavailable"); };
  });
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await dialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  await expect(dialog).toContainText("Download failed");
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
  await dialog.getByRole("button", { name: "Close export", exact: true }).click();
  await page.getByTestId("bottom-editor").getByRole("tab", { name: "Problems", exact: true }).click();
  const problems = page.getByTestId("problems-panel");
  await expect(problems).toContainText("EXPORT_FAILED");
  await expect(problems).toContainText("Download SVG export");
  await expect(problems).toContainText("storage");
  await expect(problems).toContainText("Retry the download or choose another export format");
});
