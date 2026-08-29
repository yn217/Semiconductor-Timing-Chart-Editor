import { expect, test } from "@playwright/test";

test("Delete uses one selection command across Ribbon, context menu, and keyboard", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  const ribbon = page.getByTestId("ribbon");
  const row = () => host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_request']");

  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(ribbon.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();

  await row().click();
  await expect(ribbon.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
  await page.keyboard.press("Delete");
  await expect(row()).toHaveCount(0);
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row()).toHaveCount(1);

  await row().click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Signal context menu" });
  await expect(menu.getByRole("menuitem", { name: "Delete", exact: true })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(row()).toHaveCount(0);
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row()).toHaveCount(1);

  await row().click();
  await ribbon.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row()).toHaveCount(0);
  await ribbon.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(row()).toHaveCount(1);
});
