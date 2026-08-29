import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("hands a validated Open document to the new session without duplicate session validation", async ({ page }) => {
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".ribbon-tabs").getByRole("button", { name: "File", exact: true }).click();
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  expect(savedPath).toBeTruthy();

  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({
    name: "roundtrip.tcd.json",
    mimeType: "application/json",
    buffer: await readFile(savedPath!),
  });
  await expect(host).toHaveAttribute("data-editor-idle", "true");

  const counters = JSON.parse(await host.getAttribute("data-session-counters") ?? "null") as Record<string, number>;
  expect(counters.validationRuns).toBe(0);
  expect(counters.commits).toBe(0);
  await expect(page.getByTestId("history-status")).toHaveText("History 0 / Redo 0");
  await expect(page.getByTestId("dirty-status")).toHaveText("Clean");
});
