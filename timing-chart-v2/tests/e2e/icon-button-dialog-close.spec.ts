import { expect, test } from "@playwright/test";

async function expectCloseIcon(page: import("@playwright/test").Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  await expect(button.locator("svg")).toHaveAttribute("viewBox", "0 0 24 24");
  await expect(button.locator("path")).toHaveCount(1);
  await expect(button).not.toContainText("×");
}

test("non-Home dialog close actions use the shared SVG close primitive", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("hierarchy-open").click();
  await expectCloseIcon(page, "Close hierarchy");
  await page.getByRole("button", { name: "Close hierarchy", exact: true }).click();

  await page.getByTestId("bulk-register-open").click();
  await expectCloseIcon(page, "Close bulk registration");
  await page.getByRole("button", { name: "Close bulk registration", exact: true }).click();

  await page.getByRole("button", { name: "Save As", exact: true }).first().click();
  await expectCloseIcon(page, "Close Save As");
  await page.getByRole("button", { name: "Close Save As", exact: true }).click();
});
