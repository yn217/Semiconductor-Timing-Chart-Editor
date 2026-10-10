import { expect, test } from "@playwright/test";

test("a very long selected Signal name does not push Clean/Modified and Problems out of the status bar", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto("/?transaction-demo");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  await page.locator("[data-role='frozen-row']").first().click({ position: { x: 12, y: 4 } });
  const name = page.getByLabel("Inspector signal name").first();
  await name.fill("N".repeat(250));
  await name.press("Enter");
  await expect(page.getByTestId("selection-status")).toContainText("NNNN");
  const geometry = await page.evaluate(() => {
    const right = (testId: string) => document.querySelector(`[data-testid='${testId}']`)?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY;
    return { dirty: right("dirty-status"), problems: right("problems-status"), innerWidth };
  });
  expect(geometry.dirty).toBeLessThanOrEqual(geometry.innerWidth);
  expect(geometry.problems).toBeLessThanOrEqual(geometry.innerWidth);
});
