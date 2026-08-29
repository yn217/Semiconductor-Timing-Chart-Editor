import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });

test("shows an inset clear affordance only for non-empty signal filters", async ({ page }) => {
  await page.goto("/");
  const input = page.getByTestId("signal-tree-search-top");
  const clear = page.getByRole("button", { name: "Clear signal tree filter" });

  await expect(input).toBeVisible();
  await expect(clear).toHaveCount(0);

  await input.fill("ready");
  await expect(clear).toBeVisible();
  const inputBox = await input.boundingBox();
  const clearBox = await clear.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(clearBox).not.toBeNull();
  expect(clearBox!.x).toBeGreaterThan(inputBox!.x);
  expect(clearBox!.x + clearBox!.width).toBeLessThan(inputBox!.x + inputBox!.width);
  expect(Math.abs((clearBox!.y + clearBox!.height / 2) - (inputBox!.y + inputBox!.height / 2))).toBeLessThanOrEqual(1);

  await clear.click();
  await expect(input).toHaveValue("");
  await expect(clear).toHaveCount(0);
  await expect(input).toBeVisible();
});
