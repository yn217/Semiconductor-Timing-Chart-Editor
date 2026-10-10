import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #869: editing ONE Signal's values in a 5,000-Signal document must update the MiniMap overview incrementally: the changed row is
 * rebuilt, every other row is reused, and the value changes visited stay on the order of the edited Signal (not the whole document).
 * Edit-to-idle latency is logged for the Issue. (The overview counters describe the last build, not a running total.)
 */
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("a single Signal edit rebuilds one MiniMap overview row and reuses the rest", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Cycle"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 5000, cycleCount: 100, profile: "standard" });
  const target = document.signals.find((signal, index) => index > 10 && (signal.type === "binary" || signal.type === "bus"))!;
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b869.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "5000", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  await page.getByTestId("home-minimap-toggle").check(); // MiniMap is off by default
  const minimap = page.getByTestId("minimap");
  await expect(minimap).toBeVisible({ timeout: 60_000 });
  const counters = () => minimap.evaluate((element) => {
    const read = (name: string) => Number(element.getAttribute(`data-overview-${name}`) ?? "NaN");
    return { builds: read("builds"), rebuilt: read("rows-rebuilt"), reused: read("rows-reused"), visited: read("value-changes-visited") };
  });
  // Select the Signal; its Bottom Event Table appears.
  await page.locator(`[data-role='frozen-row'][data-row-id='${target.id}']`).first().click();
  await expect(page.getByTestId("event-add-row")).toBeVisible({ timeout: 60_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const before = await counters();

  const started = Date.now();
  await page.getByTestId("event-add-row").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const latency = Date.now() - started;
  await expect.poll(async () => (await counters()).builds, { timeout: 30_000 }).toBeGreaterThan(before.builds);
  const after = await counters();
  // The counters describe the LAST overview build (not a running total): the initial Open was a full build of every row.
  console.log("E869", JSON.stringify({ initialBuild: before, afterSingleEdit: after, editToIdleMs: latency }));
  expect(before.rebuilt, "the initial build covered every Signal row").toBe(5000);
  expect(after.rebuilt, "only the edited Signal's overview row is rebuilt").toBeLessThanOrEqual(3);
  expect(after.reused, "the other rows are reused").toBeGreaterThanOrEqual(4990);
  expect(after.visited, "value changes visited stay on the order of the edited Signal, not the document's ~10,000").toBeLessThan(100);
  expect(latency, "edit-to-idle (loose, machine independent)").toBeLessThan(10_000);
});
