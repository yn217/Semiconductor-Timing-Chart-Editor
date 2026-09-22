import { expect, test } from "@playwright/test";

for (const closer of ["Cancel", "Escape"] as const) {
  test(`Bulk Signal Registration returns focus to its Add trigger on ${closer}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
    await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Add signal or group" });
    await trigger.click();
    await page.getByTestId("bulk-register-open").click();
    const dialog = page.getByRole("dialog", { name: "Bulk Signal Registration" });
    await expect(dialog).toBeVisible();
    if (closer === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: "Close bulk registration" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
