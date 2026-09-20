import { expect, test } from "@playwright/test";

test("the Signal transition form states whether it adds or edits", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
  const host = page.getByTestId("cycle-surface");
  await host.locator("[data-role='frozen-row'][data-row-id='sig_cycle_reset_n']").click();
  const mode = page.getByTestId("signal-editor").getByTestId("transition-form-mode");
  await expect(mode).toBeVisible();
  const start = page.getByTestId("signal-editor").getByLabel(/start/i).first();
  await start.fill("7");
  await expect(mode).toHaveAttribute("data-mode", "add");
  await expect(mode).toHaveText("Add new transition");
  await start.fill("0");
  await expect(mode).toHaveAttribute("data-mode", "edit");
  await expect(mode).toHaveText("Editing transition at cycle 0");
});
