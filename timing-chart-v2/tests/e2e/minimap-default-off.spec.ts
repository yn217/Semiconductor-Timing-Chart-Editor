import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";

startInCycleSample(test);

test("MiniMap is off by default and remains explicitly available from View", async ({ page }) => {
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-minimap-enabled", "false");
  const minimap = page.getByTestId("inspector").getByTestId("minimap");
  await expect(minimap).toBeHidden();
  const revision = await surface.getAttribute("data-canonical-revision");
  const history = await page.getByTestId("history-status").textContent();
  const dirty = await page.getByTestId("dirty-status").textContent();

  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();
  const toggle = page.getByTestId("view-panel-minimap");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(minimap).toBeVisible();
  await expect(surface).toHaveAttribute("data-canonical-revision", revision!);
  await expect(page.getByTestId("history-status")).toHaveText(history!);
  await expect(page.getByTestId("dirty-status")).toHaveText(dirty!);
});
