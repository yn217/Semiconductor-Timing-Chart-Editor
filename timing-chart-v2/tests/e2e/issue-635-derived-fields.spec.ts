import { expect, test } from "@playwright/test";

test("End and Duration in the Signal transition table are marked derived and read-only", async ({ page }) => {
  await page.goto("/");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.getByTestId("cycle-surface").locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();
  const editor = page.getByTestId("signal-editor");
  const derived = editor.locator(".event-columns [data-derived='true']");
  await expect(derived).toHaveCount(2);
  await expect(derived.first()).toHaveAttribute("title", /Derived/);
  const row = editor.locator("[data-testid^='event-row-end-']").first();
  await expect(row).toBeVisible();
  expect(await row.evaluate((el) => el.tagName)).toBe("OUTPUT");
  await expect(editor.locator("[data-testid^='event-row-duration-']").first()).toBeVisible();
});
