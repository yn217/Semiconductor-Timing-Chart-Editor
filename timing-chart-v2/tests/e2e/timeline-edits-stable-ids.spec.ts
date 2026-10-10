import { expect, test } from "@playwright/test";
import { startInCycleSample } from "./cycle-startup.js";
startInCycleSample(test);
test("Timeline Delete range and Insert commit on a document with stable value IDs", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await host.waitFor();
  await page.waitForTimeout(1500);
  await page.locator(".ribbon-tabs").getByRole("button", { name: "Timeline", exact: true }).click();
  const hist = () => page.getByTestId("history-status").textContent();
  await page.getByRole("button", { name: "Delete range" }).click();
  await expect.poll(hist).toBe("History 1 / Redo 0");
  await page.getByLabel("Timeline insert count").fill("2");
  await page.getByRole("button", { name: "Insert before" }).click();
  await expect.poll(hist).toBe("History 2 / Redo 0");
  await page.getByRole("button", { name: "Insert after" }).click();
  await expect.poll(hist).toBe("History 3 / Redo 0");
});
