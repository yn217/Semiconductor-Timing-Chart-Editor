import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { generatePerformanceDocument } from "@timing-chart-v2/testing";

/**
 * #933 lifecycle: with a persisted Group literally named "ungrouped" next to the synthetic Ungrouped section, and delimiter-bearing
 * Group/Lane IDs ("a:b"+"c" vs "a"+"b:c"), collapse/expand, selection and Save -> New -> Open must keep exact semantic ownership.
 */
test("collapse, selection and Save/Open keep (groupId, laneId) ownership exact for sentinel and delimiter-bearing IDs", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { window.localStorage.setItem("timing-chart-v2.view-mode", "Transaction"); } catch { /* best effort */ } });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  const base = generatePerformanceDocument({ signalCount: 4, cycleCount: 64, profile: "standard" });
  const tx = (id: string, start: number, laneId: string, groupId?: string) => ({ id, name: id, start, end: start + 6, laneId, ...(groupId === undefined ? {} : { groupId }), linkedSignals: [] });
  const document = {
    ...base,
    transactionGroups: [
      { id: "ungrouped", name: "Real ungrouped", color: "#2f6fd1", order: 0 },
      { id: "a:b", name: "Group a:b", color: "#d1602f", order: 1 },
      { id: "a", name: "Group a", color: "#2fd1a0", order: 2 },
    ],
    transactions: [tx("tx_synthetic", 2, "lane_0"), tx("tx_real_ungrouped", 10, "lane_0", "ungrouped"), tx("tx_ab_c", 18, "c", "a:b"), tx("tx_a_bc", 26, "b:c", "a")],
  };
  const input = page.locator("input[type='file'][accept='.json,.tcd']");
  await input.setInputFiles({ name: "p933b.tcd", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document)) });
  const lanes = page.getByTestId("transaction-lanes");
  await expect(lanes.locator("[data-transaction-id='tx_ab_c']")).toHaveCount(1, { timeout: 60_000 });
  const history = page.getByTestId("history-status");
  const historyBefore = await history.textContent();
  const visibleIds = () => lanes.locator("[data-transaction-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-transaction-id")!).sort());
  expect(await visibleIds()).toEqual(["tx_a_bc", "tx_ab_c", "tx_real_ungrouped", "tx_synthetic"]);

  // Collapse the PERSISTED group named "ungrouped": only its own Transaction hides; the synthetic Ungrouped section is untouched.
  const realHeader = lanes.locator("[data-testid='transaction-group-header'][data-transaction-group-id='ungrouped']");
  await realHeader.getByRole("button", { name: /^Collapse/ }).click();
  await expect(realHeader).toHaveAttribute("data-collapsed", "true");
  expect(await visibleIds()).toEqual(["tx_a_bc", "tx_ab_c", "tx_synthetic"]);
  await expect(history).toHaveText(historyBefore!);
  await realHeader.getByRole("button", { name: /^Expand/ }).click();
  expect(await visibleIds()).toEqual(["tx_a_bc", "tx_ab_c", "tx_real_ungrouped", "tx_synthetic"]);

  // Collapse the synthetic Ungrouped section: only tx_synthetic hides.
  const syntheticHeader = lanes.locator("[data-testid='transaction-group-header'][data-ungrouped='true']");
  await syntheticHeader.getByRole("button", { name: /^Collapse/ }).click();
  expect(await visibleIds()).toEqual(["tx_a_bc", "tx_ab_c", "tx_real_ungrouped"]);
  await syntheticHeader.getByRole("button", { name: /^Expand/ }).click();

  // Selection resolves the exact Transaction and its Group.
  const inspector = page.getByTestId("inspector");
  await lanes.locator("[data-transaction-id='tx_real_ungrouped']").click();
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("tx_real_ungrouped");
  await expect(inspector.getByLabel("Transaction group", { exact: true })).toHaveValue("ungrouped");
  await lanes.locator("[data-transaction-id='tx_synthetic']").click();
  await expect(inspector.getByLabel("Transaction name", { exact: true })).toHaveValue("tx_synthetic");
  await expect(inspector.getByLabel("Transaction group", { exact: true })).toHaveValue("");
  await lanes.locator("[data-transaction-id='tx_a_bc']").click();
  await expect(inspector.getByLabel("Transaction group", { exact: true })).toHaveValue("a");
  await expect(inspector.getByLabel("Transaction lane", { exact: true })).toHaveValue("b:c");
  await expect(history).toHaveText(historyBefore!);

  // Save -> New -> Open the saved file: identical ownership.
  const downloaded = page.waitForEvent("download");
  await page.getByTestId("ribbon").getByRole("button", { name: "Save", exact: true }).first().click();
  const saved = await readFile((await (await downloaded).path())!, "utf8");
  const savedJson = JSON.parse(saved) as { transactions: Array<{ id: string; groupId?: string; laneId?: string }> };
  const ownership = (rows: typeof savedJson.transactions) => rows.map((row) => `${row.id}|${row.groupId ?? "-"}|${row.laneId}`).sort();
  expect(ownership(savedJson.transactions)).toEqual(ownership(document.transactions as typeof savedJson.transactions));
  await page.getByTestId("ribbon").getByRole("button", { name: "New", exact: true }).first().click();
  await input.setInputFiles({ name: "saved933.tcd", mimeType: "application/json", buffer: Buffer.from(saved, "utf8") });
  await expect(lanes.locator("[data-transaction-id='tx_ab_c']")).toHaveCount(1, { timeout: 60_000 });
  expect(await visibleIds()).toEqual(["tx_a_bc", "tx_ab_c", "tx_real_ungrouped", "tx_synthetic"]);
  await expect(lanes.getByTestId("transaction-group-header")).toHaveCount(4);
  await expect(lanes.getByTestId("transaction-lane-label")).toHaveCount(4);
  await expect(lanes.locator("[data-testid='transaction-lane-label'][data-transaction-group-id='a:b'][data-lane-id='c']")).toHaveCount(1);
  await expect(lanes.locator("[data-testid='transaction-lane-label'][data-transaction-group-id='a'][data-lane-id='b:c']")).toHaveCount(1);
});
