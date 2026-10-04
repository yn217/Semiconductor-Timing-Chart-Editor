import { expect, test } from "@playwright/test";
import { HISTORY_RETENTION_POLICY } from "@timing-chart-v2/history";
import { startInCycleMode } from "./cycle-startup.js";

startInCycleMode(test);

test("keeps long browser edit history within the documented retention horizon", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const host = page.getByTestId("cycle-surface");
  await expect(host).toHaveAttribute("data-cycle-view-ready", "true");
  const actionCount = HISTORY_RETENTION_POLICY.maxEntries + 5;
  await page.evaluate(async (total) => {
    for (let index = 0; index < total; index += 1) {
      const buttons = document.querySelectorAll<HTMLButtonElement>("[data-role='left-tree-rows'] [data-role='tree-visibility']");
      if (buttons.length === 0) throw new Error("Expected production Signal visibility controls to be mounted.");
      buttons[index % buttons.length]!.click();
      // Allow React to project each individual UI command before the next one;
      // otherwise same-task synthetic clicks can collapse to one state update.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, actionCount);

  await expect(host).toHaveAttribute("data-history-depth", String(HISTORY_RETENTION_POLICY.maxEntries));
  const counters = JSON.parse((await host.getAttribute("data-session-counters")) ?? "{}") as {
    committedActions?: number;
    evictedEntries?: number;
    retainedEntryCount?: number;
    retainedSnapshotEstimate?: number;
  };
  expect(counters).toMatchObject({
    committedActions: actionCount,
    evictedEntries: actionCount - HISTORY_RETENTION_POLICY.maxEntries,
    retainedEntryCount: HISTORY_RETENTION_POLICY.maxEntries,
    retainedSnapshotEstimate: HISTORY_RETENTION_POLICY.maxEntries * 2,
  });
});
