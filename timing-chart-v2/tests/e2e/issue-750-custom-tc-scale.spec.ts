import { expect, test } from "@playwright/test";

// #750 section 3: "Custom…" accepts a positive integer only; an invalid draft never becomes the active cyclesPerTC mapping.
test("Custom TC scale accepts only a positive integer and never applies an invalid draft", async ({ page }) => {
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const select = page.getByTestId("transaction-tc-scale");
  await expect(select).toHaveValue("10");
  const history = await page.getByTestId("history-status").innerText();

  await select.selectOption("__custom__");
  const input = page.getByTestId("transaction-tc-scale-custom-input");
  await expect(input).toBeVisible();
  const applyButton = page.getByTestId("apply-transaction-tc-scale-custom");

  for (const invalid of ["0", "-3", "2.5", ""]) {
    await input.fill(invalid);
    await expect(applyButton).toBeDisabled();
    await expect(page.getByRole("alert")).toBeVisible();
  }
  // Invalid drafts never touched the mapping or the document.
  await expect(page.getByTestId("history-status")).toHaveText(history);

  await input.fill("7");
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
  // The mapping is applied (cyclesPerTC is a canonical Time Scale setting, same as choosing a preset) and the readout switches back to
  // the select, now showing 7 as a real (selected) option.
  await expect(select).toBeVisible();
  await expect(select).toHaveValue("7");
  await expect.poll(() => page.getByTestId("history-status").innerText()).not.toBe(history);
});
