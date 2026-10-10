import { expect, test } from "@playwright/test";

test("adding a Signal in a duplicated Scenario succeeds and Undo removes it", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.getByRole("button", { name: "Enable Scenarios" }).click();
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");

  await page.getByRole("button", { name: "Add signal or group" }).first().click();
  await page.getByRole("menuitem", { name: "Signal", exact: true }).click();

  await expect(page.getByTestId("history-status")).toHaveText("History 2 / Redo 0");
  await expect(page.locator("body")).not.toContainText("already owned");
  await expect(page.getByText(/Problems: [1-9]/)).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 1");
});
