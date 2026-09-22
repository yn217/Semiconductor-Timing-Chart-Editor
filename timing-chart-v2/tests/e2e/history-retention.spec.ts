import { expect, test } from "@playwright/test";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("keeps long browser edit history within the documented retention horizon", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const toggle = host.locator("[data-role='left-tree-rows'] [data-role='tree-visibility']").first();

  for (let index = 0; index < 100; index += 1) await toggle.click();

  await expect(host).toHaveAttribute("data-history-depth", "100");
  const counters = JSON.parse((await host.getAttribute("data-session-counters")) ?? "{}") as {
    committedActions?: number;
    evictedEntries?: number;
    retainedEntryCount?: number;
    retainedSnapshotEstimate?: number;
  };
  expect(counters).toMatchObject({ committedActions: 100, evictedEntries: 0, retainedEntryCount: 100, retainedSnapshotEstimate: 200 });
});
