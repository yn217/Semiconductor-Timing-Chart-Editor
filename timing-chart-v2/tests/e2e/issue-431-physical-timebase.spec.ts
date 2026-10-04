import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("Document Properties physical timebase formats cursor delta without changing its source-cycle value", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "View", exact: true }).click();

  await page.getByTestId("cursor-set-a").click();
  await page.getByTestId("cursor-set-b").click();
  const cycleViewport = page.getByTestId("cycle-viewport");
  for (let index = 0; index < 5; index += 1) await cycleViewport.press("Alt+ArrowRight");
  await expect(page.getByTestId("cursor-status")).toContainText("A 2");
  await expect(page.getByTestId("cursor-status")).toContainText("B 7");
  await expect(page.getByTestId("cursor-status")).toContainText("Δ 5 cycles");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  const properties = page.getByRole("dialog", { name: "Document Properties" });
  await properties.getByLabel("Timebase frequency (Hz)").fill("100000000");
  await properties.getByLabel("Display unit").selectOption("ns");
  await properties.getByTestId("apply-document-properties").click();

  await expect(page.getByTestId("cursor-status")).toContainText("A 2");
  await expect(page.getByTestId("cursor-status")).toContainText("B 7");
  await expect(page.getByTestId("cursor-status")).toContainText("Δ 5 cycles (50 ns)");
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
});
