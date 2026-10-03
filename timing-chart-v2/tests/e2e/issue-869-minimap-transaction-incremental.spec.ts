import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #869 (Transaction overview): editing ONE Transaction in an 8,000-Transaction document must update the MiniMap's Transaction overview
 * incrementally (one changed id, only the affected lane bucket rebuilt, transactions visited bounded by that lane's size rather than the whole document), not by a full rebuild. A Transaction CREATE/Duplicate is a different case: it walks the whole document (see the Issue comment). The
 * counters describe the last overview build. Edit-to-idle latency is logged for the Issue.
 */
test("a single Transaction edit updates the MiniMap Transaction overview incrementally", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const surface = page.getByTestId("cycle-surface");
  await expect(surface).toHaveAttribute("data-cycle-view-ready", "true");
  const document = generatePerformanceDocument({ signalCount: 8_000, cycleCount: 100, profile: "transaction-heavy" });
  await page.locator("input[type='file'][accept='.json,.tcd']").setInputFiles({ name: "b869t.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  await expect(page.locator(".editor-shell")).toHaveAttribute("data-signal-count", "8000", { timeout: 180_000 });
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 180_000 });
  const minimap = page.getByTestId("minimap");
  await expect(minimap).toBeVisible({ timeout: 60_000 });
  const counters = () => minimap.evaluate((element) => {
    const read = (name: string) => Number(element.getAttribute(`data-transaction-overview-${name}`) ?? "NaN");
    return { builds: read("builds"), full: read("full-builds"), incremental: read("incremental-updates"), changedIds: read("changed-id-count"), laneBuckets: read("lane-buckets-rebuilt"), visited: read("transactions-visited") };
  });
  await expect.poll(async () => (await counters()).builds, { timeout: 60_000 }).toBeGreaterThan(0);
  const before = await counters();

  // Select the first Transaction and change its END (a non-topology edit: same id, same lane, new extent).
  await page.locator(".transaction-left-tree-row[data-transaction-tree-id]").first().click();
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const inspector = page.getByTestId("inspector");
  const endField = inspector.getByLabel("Transaction end", { exact: true });
  const currentEnd = Number(await endField.inputValue());
  const started = Date.now();
  await endField.fill(String(currentEnd + 1));
  await inspector.getByTestId("apply-inspector-transaction").click();
  await expect(page.getByTestId("history-status")).toHaveText("History 1 / Redo 0");
  await expect(surface).toHaveAttribute("data-editor-idle", "true", { timeout: 60_000 });
  const latency = Date.now() - started;
  await expect.poll(async () => { const now = await counters(); return now.incremental + now.full; }, { timeout: 30_000 }).toBeGreaterThan(before.incremental + before.full);
  const after = await counters();
  console.log("E869T", JSON.stringify({ initial: before, afterSingleEdit: after, editToIdleMs: latency }));
  expect(after.full, "no additional full rebuild for a single Transaction edit").toBe(before.full);
  expect(after.incremental, "the edit was applied as an incremental update").toBeGreaterThan(before.incremental);
  expect(after.changedIds, "one Transaction changed").toBeLessThanOrEqual(2);
  expect(after.laneBuckets, "only the affected lane bucket is rebuilt (of 8)").toBeLessThanOrEqual(2);
  expect(after.visited, "Transactions visited are bounded by the affected lane(s), well below the document's 8,000").toBeLessThan(4000);
  expect(latency, "edit-to-idle (loose, machine independent)").toBeLessThan(15_000);
});
