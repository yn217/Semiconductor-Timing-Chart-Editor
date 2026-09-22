import { expect, test } from "@playwright/test";

test("Transaction mode shows its Group and Lane labels next to the timeline", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Transaction", exact: true }).click();
  const labels = page.locator(".transaction-lane-labels");
  await expect(labels).toBeVisible();
  const label = page.locator(".transaction-lane-label-row, .transaction-lane-label").first();
  await expect(label).toBeVisible();
  const box = (await label.boundingBox())!;
  const tree = (await page.getByTestId("transaction-left-tree").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(tree.x + tree.width - 1);
  const clip = await page.locator(".non-split-signal-content").first().evaluate((el) => getComputedStyle(el).clipPath);
  expect(clip).toBe("none");
});
