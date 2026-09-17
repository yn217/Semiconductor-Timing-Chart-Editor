import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const samplePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../samples/acceptance-429/sample-transaction-mode-closure.tcd.json");

test("Rename dialog returns keyboard focus to the Left Tree More actions trigger", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles(samplePath);
  await expect(host).toHaveAttribute("data-editor-idle", "true");
  await page.locator(".view-mode").getByRole("button", { name: "Cycle", exact: true }).click();

  const row = host.locator("[data-role='left-row'][data-row-id='sig_clock']");
  const trigger = row.locator("[data-role='tree-more'][data-tree-signal-id='sig_clock']");
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Signal context menu" });
  await menu.getByRole("menuitem", { name: "Rename", exact: true }).click();
  const dialog = page.getByTestId("rename-dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("New name")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("menu", { name: "Signal context menu" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.getByLabel("New name").fill("CLOCK_RENAMED");
  await page.getByTestId("apply-rename").click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(host.locator("[data-role='left-row'][data-row-id='sig_clock']")).toContainText("CLOCK_RENAMED");

  await trigger.click();
  await page.getByRole("menu", { name: "Signal context menu" }).getByRole("menuitem", { name: "Rename", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(host).toHaveAttribute("data-canonical-revision", "1");
});
