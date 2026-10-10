import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("Export page settings are shown as active only when a page size is chosen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("cycle-surface")).toHaveAttribute("data-cycle-view-ready", "true");

  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.locator(".ribbon").getByRole("button", { name: "Export", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Export Timing Chart" });
  await expect(dialog).toBeVisible();

  const pageSize = dialog.getByLabel("Export page size");
  const orientation = dialog.getByLabel("Export orientation");
  const fit = dialog.getByLabel("Export fit");
  const margin = dialog.getByLabel("Export margin");

  // Default: no page. The controls must not claim a page is applied.
  await expect(pageSize).toHaveValue("none");
  await expect(orientation).toBeDisabled();
  await expect(fit).toBeDisabled();
  await expect(margin).toBeDisabled();

  const exportSvg = async () => {
    await dialog.getByLabel("Export format").selectOption("svg");
    const pending = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export SVG" }).click();
    const result = await pending;
    return readFile((await result.path())!, "utf8");
  };

  const unpagedSvg = await exportSvg();

  // Choosing a page size enables the page controls and changes the exported output.
  await pageSize.selectOption("A4");
  await expect(orientation).toBeEnabled();
  await expect(fit).toBeEnabled();
  await expect(margin).toBeEnabled();
  const pagedSvg = await exportSvg();
  expect(pagedSvg).not.toBe(unpagedSvg);

  // Returning to None restores the unpaged export and disables the page controls again.
  await pageSize.selectOption("none");
  await expect(orientation).toBeDisabled();
  await expect(fit).toBeDisabled();
  await expect(margin).toBeDisabled();
  expect(await exportSvg()).toBe(unpagedSvg);
});
