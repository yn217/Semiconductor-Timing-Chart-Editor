import { expect, test } from "@playwright/test";

for (const startMode of ["Transaction", "Cycle"] as const) test(`first Combined entry from fresh ${startMode} startup preserves hook order`, async ({ page }) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") consoleMessages.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));

  await page.goto("/");
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Transaction");
  if (startMode === "Cycle") {
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Cycle");
  }
  await page.locator(".view-mode").getByRole("button", { name: "Combined", exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText("Mode: Combined");
  await expect(page.locator(".split-transaction-pane")).toBeVisible();
  await page.locator(".view-mode").getByRole("button", { name: startMode, exact: true }).click();
  await expect(page.getByTestId("view-mode-status")).toHaveText(`Mode: ${startMode}`);

  expect(consoleMessages.filter((message) => /change in the order of Hooks|Rendered more hooks|Rendered fewer hooks/i.test(message))).toEqual([]);
  expect(pageErrors).toEqual([]);
});
