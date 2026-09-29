import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/** #789: Save keeps Recent metadata but does not synchronously copy a large document into localStorage. */
test("Save of a large document keeps Recent metadata without a full localStorage copy", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 3000, cycleCount: 200 });
  expect(JSON.stringify(document).length).toBeGreaterThan(512 * 1024);
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "big789.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).click();
  await downloaded;
  await expect(page.getByTestId("dirty-status")).not.toHaveText("Modified");
  const stored = await page.evaluate(() => ({ recent: localStorage.getItem("timing-chart-v2.recent"), meta: JSON.parse(localStorage.getItem("timing-chart-v2.recent-meta") ?? "null") }));
  expect(stored.recent, "no full-document copy in synchronous localStorage").toBeNull();
  expect(stored.meta).toMatchObject({ filename: expect.stringContaining("tcd"), contentKept: false });
  expect(stored.meta.size).toBeGreaterThan(512 * 1024);
});
