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
  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  await expectCloseIcon(page, "Close hierarchy");
  await page.getByRole("button", { name: "Close hierarchy", exact: true }).click();

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  await expectCloseIcon(page, "Close bulk registration");
  await page.getByRole("button", { name: "Close bulk registration", exact: true }).click();

  await page.getByRole("button", { name: "Save As", exact: true }).first().click();
  await expectCloseIcon(page, "Close Save As");
  await page.getByRole("button", { name: "Close Save As", exact: true }).click();
});

test("app-owned dialogs close with Escape without changing the document", async ({ page }) => {
  await page.goto("/");
  const revision = await page.getByTestId("revision-status").textContent();
  const history = await page.getByTestId("history-status").textContent();

  await page.getByRole("button", { name: "More tree actions" }).click();
  await page.getByTestId("hierarchy-open").click();
  await expect(page.getByRole("dialog", { name: "Hardware Hierarchy" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Hardware Hierarchy" })).toBeHidden();

  await page.getByRole("button", { name: "Add signal or group" }).click();
  await page.getByTestId("bulk-register-open").click();
  await expect(page.getByRole("dialog", { name: "Bulk Signal Registration" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Bulk Signal Registration" })).toBeHidden();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Document Properties" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Document Properties" })).toBeHidden();

  await page.getByRole("button", { name: "Save As", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Save As" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Save As" })).toBeHidden();

  await page.getByRole("button", { name: "Export", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Export Timing Chart" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export Timing Chart" })).toBeHidden();

  await expect(page.getByTestId("revision-status")).toHaveText(revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
});
